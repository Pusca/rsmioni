import { useEffect, useRef, useState } from 'react';
import {
    DisconnectReason,
    Room,
    RoomEvent,
    Track,
    type RemoteTrack,
} from 'livekit-client';
import type { ErroreMedia, StatoMediaChiosco, TipoMedia } from '@/types/media';
import { terminaSessioneAi } from '@/services/kioskApi';

/** Dopo quanti secondi senza agent in stanza una sessione AI è considerata orfana. */
const AI_ORFANA_MS = 40_000;

/**
 * Livello media LiveKit lato chiosco — chiaro / nascosto / parlato.
 *
 * Scopre la sessione tramite GET /kiosk/livekit/token (che restituisce url,
 * token, session_id, tipo) e si connette per i tipi 'chiaro', 'nascosto' e
 * 'parlato'.
 *
 *   - chiaro:   il chiosco pubblica webcam e mostra il video del receptionist
 *   - nascosto: il chiosco pubblica webcam (monitoraggio); il receptionist non
 *               pubblica nulla, quindi non c'è video remoto da mostrare
 *   - parlato:  come chiaro, con in più il microfono
 */

const POLL_MS = 2_000;

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
    stato:              StatoMediaChiosco;
    errore:             ErroreMedia | null;
    condivisioneAttiva: boolean;
    grigliaDoc:         boolean; // il receptionist sta acquisendo un documento → mostra cornice guida
    inAttesa:           boolean; // il receptionist sta gestendo un altro chiosco → mostra messaggio attesa
    messaggioAttesa:    string;  // testo del messaggio di attesa (impostato dal receptionist)
    aiUi:               AiUiState; // recap live del check-in AI (form, camera, codice)
    remoteAudioTrack:   MediaStreamTrack | null; // audio del remoto (voce AI) per visualizzazioni reattive
    localCameraTrack:   MediaStreamTrack | null; // webcam già pubblicata: riusabile dove la camera è occupata (mobile)
    audioBloccato:      boolean; // autoplay negato dal browser: serve un tocco per sentire l'audio
    /** Questo chiosco è aperto su un altro dispositivo con la stessa identità (si riprova da soli tra poco). */
    duplicato:          boolean;
    /** Ultimo errore di connessione LiveKit, in chiaro (diagnostica remota). */
    ultimoErrore:       string | null;
    /** Forza subito un giro di scoperta sessione (senza aspettare il prossimo poll). */
    aggiorna:           () => void;
}

/** Dopo un DUPLICATE_IDENTITY si riprova: l'altro dispositivo potrebbe essere stato chiuso. */
const RITENTO_DUPLICATO_MS = 30_000;
/** Dopo una connessione fallita non si martella: si riprova con questo intervallo. */
const RITENTO_ERRORE_MS = 6_000;

interface TokenResp {
    url?:        string;
    token?:      string | null;
    session_id?: string | null;
    tipo?:       string | null;
    gestita_da?: string | null;
}

/** Riprova un'operazione media (webcam/microfono occupati per un istante) prima di arrendersi. */
async function conRitenti<T>(fn: () => Promise<T>, cosa: string, tentativi = 4, pausaMs = 1200): Promise<T> {
    let ultimo: unknown;
    for (let i = 0; i < tentativi; i++) {
        try {
            return await fn();
        } catch (e) {
            ultimo = e;
            console.warn(`[LiveKit-K] ${cosa} non disponibile (tentativo ${i + 1}/${tentativi})`, e);
            await new Promise((r) => setTimeout(r, pausaMs));
        }
    }
    throw ultimo;
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
    const [stato,       setStato]       = useState<StatoMediaChiosco>('idle');
    const [errore,      setErrore]      = useState<ErroreMedia | null>(null);
    const [condivisioneAttiva, setCondivisioneAttiva] = useState(false);
    const [grigliaDoc, setGrigliaDoc] = useState(false);
    const [inAttesa, setInAttesa] = useState(false);
    const [messaggioAttesa, setMessaggioAttesa] = useState('Un momento e sono subito da lei');
    const [aiUi, setAiUi] = useState<AiUiState>(AI_UI_INIZIALE);
    const [remoteAudioTrack, setRemoteAudioTrack] = useState<MediaStreamTrack | null>(null);
    const [localCameraTrack, setLocalCameraTrack] = useState<MediaStreamTrack | null>(null);
    const [audioBloccato, setAudioBloccato] = useState(false);
    const [duplicato, setDuplicato] = useState(false);
    const [ultimoErrore, setUltimoErrore] = useState<string | null>(null);
    const duplicatoRef = useRef(false);
    const gestitaRef   = useRef<'umano' | 'ai' | null>(null);
    const ritentaDopoRef = useRef(0); // timestamp prima del quale NON riconnettere
    const pollRef        = useRef<() => Promise<void>>(async () => {});
    // Track video remote (camera del receptionist e condivisione schermo):
    // tenute in stato così da riattaccarle quando la SCHERMATA cambia e il
    // <video> viene rimontato (es. Subentra: AiScreen → ParlatoScreen).
    const [remoteCamTrack,    setRemoteCamTrack]    = useState<RemoteTrack | null>(null);
    const [remoteScreenTrack, setRemoteScreenTrack] = useState<RemoteTrack | null>(null);

    // Riaggancio dei <video> dopo un cambio di schermata: gli elementi del
    // chiosco vengono creati/distrutti al variare di sessione e conduttore.
    useEffect(() => {
        const track = remoteScreenTrack ?? remoteCamTrack;
        const el = remoteVideoRef.current;
        if (el && track) track.attach(el);
    }, [remoteCamTrack, remoteScreenTrack, sessionTipo, gestitaDa, stato]);
    useEffect(() => {
        const el = localVideoRef.current;
        if (!el || !localCameraTrack) return;
        if (el.srcObject instanceof MediaStream && el.srcObject.getVideoTracks()[0] === localCameraTrack) return;
        el.srcObject = new MediaStream([localCameraTrack]);
        el.play().catch(() => {});
    }, [localCameraTrack, sessionTipo, gestitaDa, stato]);

    useEffect(() => {
        let cancelled = false;
        let orfanaTimer: ReturnType<typeof setTimeout> | null = null;

        // Sessione AI orfana: se nella stanza non c'è (più) nessun agent per
        // AI_ORFANA_MS, la sessione lato server viene chiusa dal chiosco stesso
        // così lo stato torna idle e i bottoni tornano a funzionare. Senza
        // questo, un agent caduto lasciava il chiosco appeso in "in_parlato".
        const haAgent = (room: Room) =>
            Array.from(room.remoteParticipants.values()).some((p) =>
                p.identity.startsWith('agent-') || String((p as unknown as { kind?: unknown }).kind) === '4' /* ParticipantKind.AGENT */);
        // `room` null = non siamo riusciti a connetterci: una sessione AI a cui il
        // chiosco non arriva è comunque inutile → si chiude, così l'ospite ritrova
        // i bottoni invece di "Connessione in corso" per sempre.
        const controllaOrfana = (room: Room | null, gestita: string | null) => {
            if (orfanaTimer) { clearTimeout(orfanaTimer); orfanaTimer = null; }
            if (gestita !== 'ai' || (room && haAgent(room))) return;
            orfanaTimer = setTimeout(async () => {
                if (cancelled) return;
                const r = roomRef.current;
                if (r && haAgent(r)) return;
                console.warn('[LiveKit-K] sessione AI senza agent raggiungibile: la chiudo');
                await terminaSessioneAi();
            }, AI_ORFANA_MS);
        };

        const disconnect = () => {
            if (orfanaTimer) { clearTimeout(orfanaTimer); orfanaTimer = null; }
            if (roomRef.current) {
                try { roomRef.current.disconnect(); } catch { /* ignore */ }
                roomRef.current = null;
            }
            connectedRef.current = null;
            setSessionTipo(null);
            setGestitaDa(null);
            setAiUi(AI_UI_INIZIALE);
            setRemoteAudioTrack(null);
            setRemoteCamTrack(null);
            setRemoteScreenTrack(null);
            setLocalCameraTrack(null);
            setAudioBloccato(false);
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
                if (track.kind === Track.Kind.Video) {
                    if (remoteVideoRef.current) track.attach(remoteVideoRef.current);
                    if (track.source === Track.Source.ScreenShare) {
                        setCondivisioneAttiva(true);
                        setRemoteScreenTrack(track);
                    } else {
                        setRemoteCamTrack(track);
                    }
                    if (!cancelled) setStato('connected');
                }
                if (track.kind === Track.Kind.Audio) {
                    track.attach();
                    // Espone la track per le visualizzazioni audio-reattive (voce AI)
                    if (track.mediaStreamTrack) setRemoteAudioTrack(track.mediaStreamTrack);
                    // L'AI pubblica solo audio (nessun video remoto): anche l'audio
                    // segna la connessione, altrimenti lo stato resta "connecting".
                    if (!cancelled) setStato('connected');
                }
            };

            room
                .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => attachRemote(track))
                .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
                    if (track.source === Track.Source.ScreenShare) {
                        setCondivisioneAttiva(false);
                        setRemoteScreenTrack((t) => (t === track ? null : t));
                    } else if (track.kind === Track.Kind.Video) {
                        setRemoteCamTrack((t) => (t === track ? null : t));
                    } else if (track.kind === Track.Kind.Audio) {
                        setRemoteAudioTrack((t) => (t === track.mediaStreamTrack ? null : t));
                    }
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
                .on(RoomEvent.ParticipantConnected,    () => controllaOrfana(room, gestitaRef.current))
                .on(RoomEvent.ParticipantDisconnected, () => controllaOrfana(room, gestitaRef.current))
                .on(RoomEvent.Disconnected, (reason?: DisconnectReason) => {
                    if (cancelled) return;
                    // Stessa identità connessa da un altro dispositivo: LiveKit ci ha
                    // buttati fuori. NON riconnettersi (altrimenti ci si scalcia a
                    // vicenda ogni 2 secondi): ci fermiamo e lo diciamo a schermo.
                    if (reason === DisconnectReason.DUPLICATE_IDENTITY) {
                        duplicatoRef.current = true;
                        setDuplicato(true);
                        setUltimoErrore('Identità chiosco già connessa da un altro dispositivo');
                        // Si riprova più tardi: se l'altro dispositivo è stato chiuso, si riparte
                        setTimeout(() => { duplicatoRef.current = false; }, RITENTO_DUPLICATO_MS);
                    }
                    disconnect();
                });

            // Autoplay: senza un gesto utente "fresco" il browser (soprattutto
            // mobile) blocca la riproduzione audio in silenzio. startAudio()
            // subito dopo la connessione e, se negato, ritenta al primo tocco.
            const provaSbloccoAudio = () => {
                room.startAudio()
                    .then(() => { if (!cancelled) setAudioBloccato(false); })
                    .catch(() => { if (!cancelled) setAudioBloccato(true); });
            };
            const sbloccoDaGesto = () => { if (!room.canPlaybackAudio) provaSbloccoAudio(); };
            document.addEventListener('pointerdown', sbloccoDaGesto);
            room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
                if (!cancelled) setAudioBloccato(!room.canPlaybackAudio);
            });
            room.on(RoomEvent.Disconnected, () => {
                document.removeEventListener('pointerdown', sbloccoDaGesto);
            });

            try {
                await room.connect(cred.url, cred.token);
                if (cancelled) { room.disconnect(); return; }
                // Connessi: eventuale duplicato precedente è risolto
                duplicatoRef.current = false;
                setDuplicato(false);
                setUltimoErrore(null);
                provaSbloccoAudio();

                // Il chiosco pubblica sempre la webcam (anche in nascosto);
                // nel parlato aggiunge anche il microfono.
                // La webcam può essere ancora impegnata dalla stanza presenza
                // (che la rilascia appena la sessione parte): su Windows la
                // seconda apertura fallisce con NotReadableError → si riprova
                // qualche volta invece di far fallire tutta la connessione.
                await conRitenti(() => room.localParticipant.setCameraEnabled(true), 'webcam');
                if (tipo === 'parlato') {
                    await conRitenti(() => room.localParticipant.setMicrophoneEnabled(true), 'microfono');
                }
                const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
                if (pub?.track && localVideoRef.current) pub.track.attach(localVideoRef.current);
                if (pub?.track?.mediaStreamTrack) setLocalCameraTrack(pub.track.mediaStreamTrack);

                // In nascosto non arriva video remoto: consideriamo connesso appena pubblichiamo
                if (tipo === 'nascosto' && !cancelled) setStato('connected');

                room.remoteParticipants.forEach((p) => {
                    p.trackPublications.forEach((tp) => { if (tp.track) attachRemote(tp.track as RemoteTrack); });
                });
                controllaOrfana(room, gestitaRef.current);
            } catch (err) {
                if (cancelled) return;
                console.error('[LiveKit-K] connessione fallita', err);
                const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
                setUltimoErrore(msg.slice(0, 300));
                setStato('error');
                setErrore({ tipo: 'sconosciuto', messaggio: 'Connessione media fallita.',
                    suggerimento: 'Aggiorna la pagina del chiosco e riprova.' });
                // Rilascia la stanza e permetti un nuovo tentativo al prossimo poll
                // (con pausa): prima restava "error" per sempre finché la sessione
                // non cambiava.
                try { room.disconnect(); } catch { /* ignore */ }
                roomRef.current = null;
                connectedRef.current = null;
                ritentaDopoRef.current = Date.now() + RITENTO_ERRORE_MS;
                controllaOrfana(null, gestitaRef.current);
            }
        };

        const poll = async () => {
            if (cancelled || duplicatoRef.current) return; // fermi: il chiosco è altrove
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
            const gestita = resp.gestita_da === 'ai' ? 'ai' : 'umano';
            gestitaRef.current = gestita;
            setGestitaDa(gestita);
            if (roomRef.current && sid === connectedRef.current) controllaOrfana(roomRef.current, gestita);

            // Nuova sessione da connettere (o cambio di sessione), rispettando la
            // pausa dopo un errore di connessione
            if (sid !== connectedRef.current && Date.now() >= ritentaDopoRef.current) {
                if (connectedRef.current) disconnect();
                await connect({ url, token, session_id: sid }, tipo);
            }
        };

        // Un solo giro alla volta: `aggiorna()` dall'esterno e il timer non
        // devono sovrapporsi (due connect sulla stessa sessione).
        let inCorso: Promise<void> | null = null;
        const pollSerializzato = () => {
            if (inCorso) return inCorso;
            inCorso = poll().catch(() => {}).finally(() => { inCorso = null; });
            return inCorso;
        };
        pollRef.current = pollSerializzato;

        pollSerializzato();
        const id = setInterval(pollSerializzato, POLL_MS);

        return () => {
            cancelled = true;
            clearInterval(id);
            disconnect();
        };
    }, []);

    const aggiorna = () => { void pollRef.current(); };

    return { sessionTipo, gestitaDa, localVideoRef, remoteVideoRef, stato, errore, condivisioneAttiva, grigliaDoc, inAttesa, messaggioAttesa, aiUi, remoteAudioTrack, localCameraTrack, audioBloccato, duplicato, ultimoErrore, aggiorna };
}
