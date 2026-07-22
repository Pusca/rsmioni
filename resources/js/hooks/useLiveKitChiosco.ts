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

/** Opzione camera proposta dall'AI durante la scelta (da /agent/camere). */
export interface CameraOpzione {
    camera_id:     string;
    nome:          string;
    tipo:          string;
    piano:         number;
    posti:         number;
    capienza_ok:   boolean;
    prezzo_notte:  number | null;
    prezzo_totale: number | null;
    descrizione:   string | null;
    dotazioni:     string[];
    quante_simili: number;
}

/** Riepilogo finale: nome ufficiale letto dal documento + dati del soggiorno. */
export interface RiepilogoFinale {
    nome?: string | null; cognome?: string | null;
    check_in?: string | null; check_out?: string | null;
    adulti?: number | null; ragazzi?: number | null; bambini?: number | null;
    camera?: string | null; piano?: number | null;
    codice?: string | null;
}

/** Dati del check-in/out AI mostrati in tempo reale sullo schermo del chiosco. */
export interface AiUiState {
    form:      { nome?: string; cognome?: string; check_in?: string; check_out?: string;
                 adulti?: number; ragazzi?: number; bambini?: number };
    camera:    { nome?: string; piano?: number | null; tipo?: string } | null;
    camereOpzioni: CameraOpzione[] | null; // opzioni tra cui l'ospite sta scegliendo
    riepilogo: RiepilogoFinale | null;     // pagina finale con nome dal documento
    codice:    string | null;
    pagamento: { importo?: number; stato?: 'in_corso' | 'ok' | 'ko' } | null;
    fase:      string | null; // fase FSM del processo (stepper): dati, conferma, salvata, camera, documento...
}

const AI_UI_INIZIALE: AiUiState = { form: {}, camera: null, camereOpzioni: null, riepilogo: null, codice: null, pagamento: null, fase: null };

interface Result {
    sessionTipo:        TipoMedia | null;
    gestitaDa:          'umano' | 'ai' | null; // chi conduce la sessione (AI = self check-in vocale)
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoChiosco;
    errore:             ErroreMedia | null;
    condivisioneAttiva: boolean;
    grigliaDoc:         boolean; // il receptionist sta acquisendo un documento → mostra cornice guida
    inAttesa:           boolean; // il receptionist sta gestendo un altro chiosco → mostra messaggio attesa
    messaggioAttesa:    string;  // testo del messaggio di attesa (impostato dal receptionist)
    aiUi:               AiUiState; // recap live del check-in AI (form, camera, codice)
    remoteAudioTrack:   MediaStreamTrack | null; // audio del remoto (voce AI) per visualizzazioni reattive
}

interface TokenResp {
    url?:        string;
    token?:      string | null;
    session_id?: string | null;
    tipo?:       string | null;
    gestita_da?: string | null;
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
    const [gestitaDa,   setGestitaDa]   = useState<'umano' | 'ai' | null>(null);
    const [stato,       setStato]       = useState<StatoChiosco>('idle');
    const [errore,      setErrore]      = useState<ErroreMedia | null>(null);
    const [condivisioneAttiva, setCondivisioneAttiva] = useState(false);
    const [grigliaDoc, setGrigliaDoc] = useState(false);
    const [inAttesa, setInAttesa] = useState(false);
    const [messaggioAttesa, setMessaggioAttesa] = useState('Un momento e sono subito da lei');
    const [aiUi, setAiUi] = useState<AiUiState>(AI_UI_INIZIALE);
    const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null);

    useEffect(() => {
        let cancelled = false;

        const disconnect = () => {
            if (roomRef.current) {
                try { roomRef.current.disconnect(); } catch { /* ignore */ }
                roomRef.current = null;
            }
            connectedRef.current = null;
            setSessionTipo(null);
            setGestitaDa(null);
            setAiUi(AI_UI_INIZIALE);
            setRemoteAudioTrack(null);
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
                if (track.kind === Track.Kind.Audio) {
                    track.attach();
                    // Espone la track per le visualizzazioni audio-reattive (voce AI)
                    if (track.mediaStreamTrack) setRemoteAudioTrack(track.mediaStreamTrack);
                }
            };

            room
                .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => attachRemote(track))
                .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
                    if (track.source === Track.Source.ScreenShare) setCondivisioneAttiva(false);
                })
                .on(RoomEvent.DataReceived, (payload: Uint8Array) => {
                    try {
                        const msg = JSON.parse(new TextDecoder().decode(payload)) as {
                            topic?: string; testo?: string; tipo?: string;
                            form?: AiUiState['form']; camera?: AiUiState['camera']; codice?: string;
                            pagamento?: AiUiState['pagamento']; fase?: string;
                            opzioni?: CameraOpzione[] | null;
                            riepilogo?: RiepilogoFinale | null;
                        };
                        if (msg.topic === 'doc_capture_on')  setGrigliaDoc(true);
                        if (msg.topic === 'doc_capture_off') setGrigliaDoc(false);
                        if (msg.topic === 'attesa_on')  { setInAttesa(true); if (msg.testo) setMessaggioAttesa(msg.testo); }
                        if (msg.topic === 'attesa_off') setInAttesa(false);
                        // Recap live del check-in AI: i dati detti a voce appaiono scritti
                        if (msg.topic === 'ai_ui') {
                            if (msg.tipo === 'form'   && msg.form)   setAiUi((p) => ({ ...p, form: { ...p.form, ...msg.form } }));
                            if (msg.tipo === 'camera' && msg.camera) setAiUi((p) => ({ ...p, camera: msg.camera ?? null, camereOpzioni: null }));
                            if (msg.tipo === 'camere_opzioni') setAiUi((p) => ({ ...p, camereOpzioni: msg.opzioni ?? null }));
                            if (msg.tipo === 'riepilogo' && msg.riepilogo) setAiUi((p) => ({ ...p, riepilogo: msg.riepilogo ?? null, camereOpzioni: null, codice: msg.riepilogo?.codice ?? p.codice }));
                            if (msg.tipo === 'codice' && msg.codice) setAiUi((p) => ({ ...p, codice: msg.codice ?? null }));
                            if (msg.tipo === 'pagamento' && msg.pagamento) setAiUi((p) => ({ ...p, pagamento: msg.pagamento ?? null }));
                            if (msg.tipo === 'fase' && msg.fase) setAiUi((p) => ({ ...p, fase: msg.fase ?? null }));
                        }
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

            // gestita_da può cambiare a sessione invariata (subentro del
            // receptionist sull'AI): sincronizza a ogni poll.
            setGestitaDa(resp.gestita_da === 'ai' ? 'ai' : 'umano');

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

    return { sessionTipo, gestitaDa, localVideoRef, remoteVideoRef, stato, errore, condivisioneAttiva, grigliaDoc, inAttesa, messaggioAttesa, aiUi, remoteAudioTrack };
}
