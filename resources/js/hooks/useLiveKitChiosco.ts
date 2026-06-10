import { useEffect, useRef, useState } from 'react';
import {
    Room,
    RoomEvent,
    Track,
    type RemoteTrack,
} from 'livekit-client';
import type { ErroreMedia } from '@/services/webrtcMedia';

/**
 * Livello media LiveKit lato chiosco — collegamento in chiaro/nascosto.
 *
 * Affianca useWebRtcChiosco (che resta per il parlato). Scopre la sessione
 * tramite GET /kiosk/livekit/token (che restituisce url, token, session_id, tipo)
 * e si connette solo per i tipi 'chiaro' e 'nascosto'.
 *
 *   - chiaro:   il chiosco pubblica webcam e mostra il video del receptionist
 *   - nascosto: il chiosco pubblica webcam (monitoraggio); il receptionist non
 *               pubblica nulla, quindi non c'è video remoto da mostrare
 */

export type StatoChiosco = 'idle' | 'connecting' | 'connected' | 'error';

const POLL_MS = 2_000;

type TipoMedia = 'chiaro' | 'nascosto' | 'parlato';

interface Result {
    sessionTipo:        TipoMedia | null;
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoChiosco;
    errore:             ErroreMedia | null;
    condivisioneAttiva: boolean;
    grigliaDoc:         boolean; // il receptionist sta acquisendo un documento → mostra cornice guida
    inAttesa:           boolean; // il receptionist sta gestendo un altro chiosco → mostra "un momento…"
}

interface TokenResp {
    url?:        string;
    token?:      string | null;
    session_id?: string | null;
    tipo?:       string | null;
}

async function fetchToken(): Promise<TokenResp | null> {
    try {
        const res = await fetch('/kiosk/livekit/token', {
            headers: { 'Accept': 'application/json' },
        });
        if (!res.ok) return null;
        return await res.json() as TokenResp;
    } catch {
        return null;
    }
}

export function useLiveKitChiosco(): Result {
    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const roomRef        = useRef<Room | null>(null);
    const connectedRef   = useRef<string | null>(null); // sessionId attualmente connesso

    const [sessionTipo, setSessionTipo] = useState<TipoMedia | null>(null);
    const [stato,       setStato]       = useState<StatoChiosco>('idle');
    const [errore,      setErrore]      = useState<ErroreMedia | null>(null);
    const [condivisioneAttiva, setCondivisioneAttiva] = useState(false);
    const [grigliaDoc, setGrigliaDoc] = useState(false);
    const [inAttesa, setInAttesa] = useState(false);

    useEffect(() => {
        let cancelled = false;

        const disconnect = () => {
            if (roomRef.current) {
                try { roomRef.current.disconnect(); } catch { /* ignore */ }
                roomRef.current = null;
            }
            connectedRef.current = null;
            setSessionTipo(null);
            setStato('idle');
            setCondivisioneAttiva(false);
            setGrigliaDoc(false);
            setInAttesa(false);
            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
        };

        const connect = async (cred: { url: string; token: string; session_id: string }, tipo: TipoMedia) => {
            connectedRef.current = cred.session_id;
            setSessionTipo(tipo);
            setStato('connecting');
            setErrore(null);

            const room = new Room({ adaptiveStream: true, dynacast: true });
            roomRef.current = room;

            const attachRemote = (track: RemoteTrack) => {
                if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
                    track.attach(remoteVideoRef.current);
                    if (track.source === Track.Source.ScreenShare) setCondivisioneAttiva(true);
                    if (!cancelled) setStato('connected');
                }
                if (track.kind === Track.Kind.Audio) track.attach();
            };

            room
                .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => attachRemote(track))
                .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
                    if (track.source === Track.Source.ScreenShare) setCondivisioneAttiva(false);
                })
                .on(RoomEvent.DataReceived, (payload: Uint8Array) => {
                    try {
                        const msg = JSON.parse(new TextDecoder().decode(payload)) as { topic?: string };
                        if (msg.topic === 'doc_capture_on')  setGrigliaDoc(true);
                        if (msg.topic === 'doc_capture_off') setGrigliaDoc(false);
                        if (msg.topic === 'attesa_on')  setInAttesa(true);
                        if (msg.topic === 'attesa_off') setInAttesa(false);
                    } catch { /* ignora messaggi non riconosciuti */ }
                })
                .on(RoomEvent.Disconnected, () => { if (!cancelled) disconnect(); });

            try {
                await room.connect(cred.url, cred.token);
                if (cancelled) { room.disconnect(); return; }
                console.log('[LiveKit-K] connesso alla stanza', cred.session_id, tipo);

                // Il chiosco pubblica sempre la webcam (anche in nascosto);
                // nel parlato aggiunge anche il microfono.
                await room.localParticipant.setCameraEnabled(true);
                if (tipo === 'parlato') {
                    await room.localParticipant.setMicrophoneEnabled(true);
                }
                const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
                if (pub?.track && localVideoRef.current) pub.track.attach(localVideoRef.current);

                // In nascosto non arriva video remoto: consideriamo connesso appena pubblichiamo
                if (tipo === 'nascosto' && !cancelled) setStato('connected');

                room.remoteParticipants.forEach((p) => {
                    p.trackPublications.forEach((tp) => { if (tp.track) attachRemote(tp.track as RemoteTrack); });
                });
            } catch (err) {
                if (cancelled) return;
                console.error('[LiveKit-K] connessione fallita', err);
                setStato('error');
                setErrore({ tipo: 'sconosciuto', messaggio: 'Connessione media fallita.',
                    suggerimento: 'Aggiorna la pagina del chiosco e riprova.' });
            }
        };

        const poll = async () => {
            if (cancelled) return;
            const resp = await fetchToken();
            if (cancelled || !resp) return;

            const tipo  = resp.tipo;
            const url   = resp.url;
            const token = resp.token;
            const sid   = resp.session_id;
            const isMedia = tipo === 'chiaro' || tipo === 'nascosto' || tipo === 'parlato';

            // Nessuna sessione attiva → disconnetti
            if (!sid || !token || !url || !isMedia) {
                if (connectedRef.current) disconnect();
                return;
            }

            // Nuova sessione da connettere (o cambio di sessione)
            if (sid !== connectedRef.current) {
                if (connectedRef.current) disconnect();
                await connect({ url, token, session_id: sid }, tipo);
            }
        };

        poll();
        const id = setInterval(poll, POLL_MS);

        return () => {
            cancelled = true;
            clearInterval(id);
            disconnect();
        };
    }, []);

    return { sessionTipo, localVideoRef, remoteVideoRef, stato, errore, condivisioneAttiva, grigliaDoc, inAttesa };
}
