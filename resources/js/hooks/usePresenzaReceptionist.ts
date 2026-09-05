import { useEffect, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track, VideoPresets, type RemoteTrack, type RemoteParticipant } from 'livekit-client';

/**
 * Presenza del receptionist sul chiosco (docs/11 — canale sempre acceso).
 *
 * Si collega alla stanza "presenza-{hotelId}" del proprio hotel e:
 *   - espone la webcam del receptionist (grande e muta in attesa);
 *   - riproduce la sua VOCE quando arriva (il receptionist ha acceso il
 *     microfono verso questo chiosco: `parla` = true);
 *   - pubblica la propria webcam a bassa risoluzione (griglia live in
 *     Portineria) finché `pubblicaCamera` è true — cioè quando la camera non
 *     è già impegnata in una sessione chiaro/parlato/AI;
 *   - accende il proprio microfono solo su richiesta del receptionist
 *     (messaggio dati {type:'mic', on}).
 *
 * La connessione è persistente con retry: se il receptionist va e viene, la
 * track appare e scompare da sola.
 */

const RETRY_MS = 15_000;
const TOPIC    = 'presenza';

interface Result {
    /** Track video del receptionist, null se offline. */
    track:            MediaStreamTrack | null;
    online:           boolean;
    /** Nome del receptionist online (dal partecipante LiveKit). */
    nome:             string | null;
    /** Il receptionist sta parlando con QUESTO chiosco (audio in arrivo). */
    parla:            boolean;
    /** Il microfono del chiosco è acceso verso il receptionist. */
    microfonoAttivo:  boolean;
    /** Il browser ha bloccato la riproduzione audio finché l'ospite non tocca lo schermo. */
    audioBloccato:    boolean;
    /** Stessa identità chiosco connessa altrove (si riprova da soli tra poco). */
    duplicato:        boolean;
    /** Stanza presenza collegata. */
    connessa:         boolean;
    /** Ultimo errore di connessione, in chiaro (diagnostica remota). */
    errore:           string | null;
}

const RITENTO_DUPLICATO_MS = 30_000;

export function usePresenzaReceptionist(pubblicaCamera: boolean): Result {
    const [track, setTrack]       = useState<MediaStreamTrack | null>(null);
    const [nome, setNome]         = useState<string | null>(null);
    const [parla, setParla]       = useState(false);
    const [mic, setMic]           = useState(false);
    const [bloccato, setBloccato] = useState(false);
    const [duplicato, setDuplicato] = useState(false);
    const [connessa, setConnessa]   = useState(false);
    const [errore, setErrore]       = useState<string | null>(null);
    const roomRef  = useRef<Room | null>(null);
    const audioRef = useRef<HTMLMediaElement[]>([]);

    // Pubblicazione camera: segue `pubblicaCamera` senza riconnettere
    useEffect(() => {
        const room = roomRef.current;
        if (!room || room.state !== 'connected') return;
        room.localParticipant.setCameraEnabled(pubblicaCamera).catch(() => {});
    }, [pubblicaCamera]);

    useEffect(() => {
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const provaPlay = () => {
            let ok = true;
            audioRef.current.forEach((el) => { el.play().catch(() => { ok = false; }); });
            setBloccato(!ok);
        };
        const sblocca = () => provaPlay();
        window.addEventListener('pointerdown', sblocca, { passive: true });

        const connect = async () => {
            if (cancelled || roomRef.current) return;
            try {
                const res = await fetch('/kiosk/presenza/token', { headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`token ${res.status}`);
                const cred = await res.json() as { url?: string; token?: string };
                if (!cred.url || !cred.token) throw new Error('token mancante');

                const room = new Room({
                    videoCaptureDefaults: { resolution: VideoPresets.h180.resolution },
                    publishDefaults: { videoEncoding: { maxBitrate: 150_000, maxFramerate: 12 } },
                });
                roomRef.current = room;

                const aggiornaVideo = () => {
                    // La camera del receptionist: unico video remoto non proveniente da un chiosco
                    let trovata: MediaStreamTrack | null = null;
                    let chi: string | null = null;
                    room.remoteParticipants.forEach((p: RemoteParticipant) => {
                        if (p.identity.startsWith('presenza-kiosk-')) return;
                        p.videoTrackPublications.forEach((pub) => {
                            if (pub.track?.mediaStreamTrack) { trovata = pub.track.mediaStreamTrack; chi = p.name || null; }
                        });
                    });
                    if (!cancelled) { setTrack(trovata); setNome(trovata ? chi : null); }
                };

                room
                    .on(RoomEvent.TrackSubscribed, (t: RemoteTrack) => {
                        if (t.kind === Track.Kind.Video) aggiornaVideo();
                        if (t.kind === Track.Kind.Audio) {
                            const el = t.attach();
                            document.body.appendChild(el);
                            audioRef.current.push(el);
                            setParla(true);
                            provaPlay();
                        }
                    })
                    .on(RoomEvent.TrackUnsubscribed, (t: RemoteTrack) => {
                        if (t.kind === Track.Kind.Audio) {
                            t.detach().forEach((el) => { el.remove(); audioRef.current = audioRef.current.filter((x) => x !== el); });
                            if (audioRef.current.length === 0) setParla(false);
                        }
                        aggiornaVideo();
                    })
                    .on(RoomEvent.ParticipantDisconnected, () => {
                        aggiornaVideo();
                        // Receptionist uscito (browser chiuso, rete): niente più
                        // parlato né ascolto → il microfono del chiosco si spegne da solo,
                        // altrimenti resterebbe acceso verso una stanza vuota.
                        if (room.remoteParticipants.size === 0) {
                            setParla(false);
                            room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
                            setMic(false);
                        }
                    })
                    .on(RoomEvent.DataReceived, (payload: Uint8Array, _p, _k, topic?: string) => {
                        if (topic !== TOPIC) return;
                        try {
                            const msg = JSON.parse(new TextDecoder().decode(payload)) as { type?: string; on?: boolean };
                            if (msg.type === 'mic') {
                                room.localParticipant.setMicrophoneEnabled(!!msg.on)
                                    .then(() => setMic(!!msg.on))
                                    .catch(() => setMic(false));
                            }
                        } catch { /* messaggio non nostro */ }
                    })
                    .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
                        roomRef.current = null;
                        if (cancelled) return;
                        setTrack(null); setNome(null); setParla(false); setMic(false); setConnessa(false);
                        if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
                            // Un altro dispositivo ha aperto questo chiosco: non
                            // martellare (ci si scalcerebbe a vicenda), ma riprovare
                            // più tardi — l'altro potrebbe essere stato chiuso.
                            setDuplicato(true);
                            setErrore('Identità chiosco già connessa da un altro dispositivo');
                            retryTimer = setTimeout(connect, RITENTO_DUPLICATO_MS);
                            return;
                        }
                        retryTimer = setTimeout(connect, RETRY_MS);
                    });

                await room.connect(cred.url, cred.token);
                if (cancelled) { room.disconnect(); return; }
                setConnessa(true); setDuplicato(false); setErrore(null);
                aggiornaVideo();
                if (pubblicaCamera) {
                    room.localParticipant.setCameraEnabled(true)
                        .catch((e: unknown) => setErrore('Webcam chiosco non disponibile: ' + (e instanceof Error ? e.message : String(e))));
                }
            } catch (e) {
                roomRef.current = null;
                if (!cancelled) {
                    setErrore((e instanceof Error ? `${e.name}: ${e.message}` : String(e)).slice(0, 300));
                    retryTimer = setTimeout(connect, RETRY_MS);
                }
            }
        };

        connect();

        return () => {
            cancelled = true;
            window.removeEventListener('pointerdown', sblocca);
            if (retryTimer) clearTimeout(retryTimer);
            audioRef.current.forEach((el) => el.remove());
            audioRef.current = [];
            if (roomRef.current) { try { roomRef.current.disconnect(); } catch { /* ignore */ } roomRef.current = null; }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return { track, online: track !== null, nome, parla, microfonoAttivo: mic, audioBloccato: bloccato, duplicato, connessa, errore };
}
