import { useCallback, useEffect, useRef, useState } from 'react';
import { inviaSignalWebRtc } from '@/services/portineriaApi';
import {
    classificaErroreMedia,
    classificaErroreCondivisione,
    messaggioPeerFallito,
    TIMEOUT_MSG,
    type ErroreMedia,
} from '@/services/webrtcMedia';

// Tipo minimo — stesso pattern di EchoChannel in usePortineriaRealtime.ts
interface EchoChannel {
    listen(event: string, callback: (data: unknown) => void): this;
    error(callback: (error: unknown) => void): this;
}

interface WebRtcSignalData {
    tipo:    'offer' | 'answer' | 'ice-candidate' | 'chiosco_ready' | 'sessione_chiusa';
    payload: Record<string, unknown>;
    mittente: 'receptionist' | 'chiosco';
}

export type StatoParlato =
    | 'idle'
    | 'waiting_chiosco'   // canale aperto — in attesa di chiosco_ready
    | 'connecting'        // offer inviata — in attesa di answer + ICE
    | 'connected'         // P2P stabilito, stream attivi
    | 'error';

/** Timeout (ms) entro cui il chiosco deve rispondere con chiosco_ready */
const CHIOSCO_READY_TIMEOUT_MS = 20_000;

interface Options {
    sessionId: string | null;
    chioscoId: string | null;
    attivo:    boolean;
}

interface Result {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:  StatoParlato;
    errore: ErroreMedia | null;
    // Condivisione schermo
    condivisioneSchermo:  boolean;
    avviaCondivisione:    () => Promise<void>;
    fermaCondivisione:    () => void;
    /** Errore transiente di getDisplayMedia — non blocca il parlato */
    erroreCondivisione:   ErroreMedia | null;
    clearErroreCondivisione: () => void;
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Gestisce il ciclo di vita di una sessione WebRTC lato receptionist.
 *
 * Ordine operazioni (fix race condition):
 *   1. Crea RTCPeerConnection
 *   2. Abbonati a webrtc.{sessionId} via Echo  ← PRIMA di getUserMedia
 *   3. getUserMedia (attende permessi)
 *   4. Configura tracks, remote stream, ICE handler
 *   5. Avvia timeout 20s
 *   6. Quando arriva 'chiosco_ready' E getUserMedia è risolto → crea offer
 *      (flag offerSent previene duplicati se i due eventi sono quasi simultanei)
 *   7. Quando arriva 'answer' → setRemoteDescription
 *   8. ICE candidates bidirezionali
 *
 * Il chiosco manda 'chiosco_ready' solo dopo aver completato getUserMedia e
 * subscribed al canale webrtc — il receptionist potrebbe riceverlo mentre
 * getUserMedia è ancora pendente. L'approccio a flag gestisce entrambi gli ordini.
 */
export function useWebRtcParlato({ sessionId, chioscoId, attivo }: Options): Result {
    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const pcRef           = useRef<RTCPeerConnection | null>(null);
    const channelRef      = useRef<EchoChannel | null>(null);
    const localStreamRef  = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const sessionIdRef    = useRef<string | null>(sessionId);

    const [stato,               setStato]              = useState<StatoParlato>('idle');
    const [errore,              setErrore]             = useState<ErroreMedia | null>(null);
    const [condivisioneSchermo, setCondivisioneSchermo] = useState(false);
    const [erroreCondivisione,  setErroreCondivisione] = useState<ErroreMedia | null>(null);

    const erroreCondivisioneTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // sessionIdRef sempre aggiornato (usato dalle callback stabili)
    useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);

    // ── Errore condivisione — helper per mostrare e auto-dismettere ───────────

    const mostraErroreCondivisione = useCallback((err: ErroreMedia): void => {
        if (erroreCondivisioneTimerRef.current) {
            clearTimeout(erroreCondivisioneTimerRef.current);
        }
        setErroreCondivisione(err);
        // Auto-dismiss dopo 10 secondi
        erroreCondivisioneTimerRef.current = setTimeout(() => {
            setErroreCondivisione(null);
            erroreCondivisioneTimerRef.current = null;
        }, 10_000);
    }, []);

    const clearErroreCondivisione = useCallback((): void => {
        if (erroreCondivisioneTimerRef.current) {
            clearTimeout(erroreCondivisioneTimerRef.current);
            erroreCondivisioneTimerRef.current = null;
        }
        setErroreCondivisione(null);
    }, []);

    // ── Condivisione schermo — callback stabili (leggono da ref) ──────────────

    const fermaCondivisione = useCallback((): void => {
        const screen = screenStreamRef.current;
        if (!screen) return;

        screen.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;

        // Ripristina il track webcam nel sender
        const webcamTrack = localStreamRef.current?.getVideoTracks()[0];
        const sender      = pcRef.current?.getSenders().find(s => s.track?.kind === 'video');
        if (sender && webcamTrack) {
            sender.replaceTrack(webcamTrack).catch(() => { /* pc potrebbe essere già chiuso */ });
        }

        // Ripristina preview locale con webcam
        if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }

        setCondivisioneSchermo(false);

        const sid = sessionIdRef.current;
        if (sid) {
            inviaSignalWebRtc(sid, 'screen_share_stopped', {});
            console.log('[WebRTC-R] screen_share_stopped inviato');
        }
    }, []);

    const avviaCondivisione = useCallback(async (): Promise<void> => {
        if (!pcRef.current || !localStreamRef.current) {
            console.warn('[WebRTC-R] avviaCondivisione: PC non pronto');
            return;
        }
        if (screenStreamRef.current) return; // già attiva

        // Pulisci eventuale errore precedente
        clearErroreCondivisione();

        let screenStream: MediaStream;
        try {
            console.log('[WebRTC-R] getDisplayMedia start...');
            screenStream = await navigator.mediaDevices.getDisplayMedia({
                video: true,
                audio: false,
            });
            console.log('[WebRTC-R] getDisplayMedia ok');
        } catch (err) {
            const errMedia = classificaErroreCondivisione(err);
            console.warn('[WebRTC-R] getDisplayMedia fallito:', errMedia.tipo,
                err instanceof DOMException ? err.name : String(err));
            mostraErroreCondivisione(errMedia);
            return;
        }

        const screenTrack = screenStream.getVideoTracks()[0];
        if (!screenTrack) {
            screenStream.getTracks().forEach(t => t.stop());
            return;
        }

        // Sostituisce il video sender senza rinegoziare (replaceTrack)
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (!sender) {
            console.warn('[WebRTC-R] nessun video sender — track replacement impossibile');
            screenStream.getTracks().forEach(t => t.stop());
            return;
        }

        try {
            await sender.replaceTrack(screenTrack);
        } catch (err) {
            screenStream.getTracks().forEach(t => t.stop());
            console.error('[WebRTC-R] replaceTrack fallito:', err);
            mostraErroreCondivisione({
                tipo: 'sconosciuto',
                messaggio: 'Impossibile attivare la condivisione schermo.',
                suggerimento: 'La connessione WebRTC potrebbe essere in uno stato non valido. Riprova.',
            });
            return;
        }

        screenStreamRef.current = screenStream;

        // Mostra l'anteprima dello schermo nel video locale
        if (localVideoRef.current) {
            localVideoRef.current.srcObject = screenStream;
        }

        // Quando l'utente clicca "Stop" nel browser → ferma la condivisione
        screenTrack.addEventListener('ended', () => fermaCondivisione(), { once: true });

        setCondivisioneSchermo(true);

        const sid = sessionIdRef.current;
        if (sid) {
            await inviaSignalWebRtc(sid, 'screen_share_started', {});
            console.log('[WebRTC-R] screen_share_started inviato');
        }
    }, [fermaCondivisione, clearErroreCondivisione, mostraErroreCondivisione]);

    // ── Ciclo di vita WebRTC ───────────────────────────────────────────────────

    useEffect(() => {
        if (!attivo || !sessionId || !chioscoId) return;

        let cancelled   = false;
        let offerSent   = false;          // previene offer doppia
        let mediaReady  = false;          // getUserMedia risolto
        let chioscoReady = false;         // chiosco_ready ricevuto

        let readyTimeout: ReturnType<typeof setTimeout> | null = null;

        // Funzione che crea e invia l'offer solo quando ENTRAMBE le condizioni sono soddisfatte
        const tryCreateOffer = async () => {
            if (!mediaReady || !chioscoReady || offerSent || cancelled) return;
            const pc = pcRef.current;
            if (!pc) return;

            offerSent = true;
            setStato('connecting');

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log('[WebRTC-R] offer inviata, sdp type:', offer.type);
                await inviaSignalWebRtc(sessionId, 'offer', {
                    type: offer.type,
                    sdp:  offer.sdp ?? '',
                });
            } catch {
                if (!cancelled) {
                    setStato('error');
                    setErrore({
                        tipo: 'sconosciuto',
                        messaggio: 'Errore nella creazione dell\'offerta WebRTC.',
                        suggerimento: 'Riprova ad avviare il parlato.',
                    });
                }
            }
        };

        const avvia = async () => {
            setStato('waiting_chiosco');
            setErrore(null);
            console.group('[WebRTC-R] avvio sessione', sessionId);

            // ── 1. RTCPeerConnection ────────────────────────────────────────
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            console.log('[WebRTC-R] RTCPeerConnection creata');
            pcRef.current = pc;

            // ── 2. Abbonamento Echo PRIMA di getUserMedia ───────────────────
            //    Così non perdiamo mai chiosco_ready anche se getUserMedia
            //    risolve velocemente (browser con permessi pre-approvati).
            if (typeof window !== 'undefined' && window.Echo) {
                try {
                    const ch = window.Echo.private(
                        `webrtc.${sessionId}`,
                    ) as unknown as EchoChannel;
                    channelRef.current = ch;

                    ch.listen('.webrtc.signal', async (raw: unknown) => {
                        if (cancelled) return;
                        const sig = raw as WebRtcSignalData;

                        if (sig.mittente === 'receptionist') return;

                        try {
                            if (sig.tipo === 'chiosco_ready') {
                                console.log('[WebRTC-R] chiosco_ready ricevuto');
                                if (readyTimeout) {
                                    clearTimeout(readyTimeout);
                                    readyTimeout = null;
                                }
                                chioscoReady = true;
                                await tryCreateOffer();
                            } else if (sig.tipo === 'answer') {
                                console.log('[WebRTC-R] answer ricevuta');
                                await pc.setRemoteDescription(
                                    new RTCSessionDescription(
                                        sig.payload as unknown as RTCSessionDescriptionInit,
                                    ),
                                );
                            } else if (sig.tipo === 'ice-candidate' && sig.payload.candidate) {
                                console.log('[WebRTC-R] ICE candidate ricevuto dal chiosco');
                                await pc.addIceCandidate(
                                    new RTCIceCandidate(
                                        sig.payload.candidate as RTCIceCandidateInit,
                                    ),
                                );
                            }
                        } catch { /* peer già chiuso o segnale malformato */ }
                    });

                    ch.error(() => {
                        console.error('[WebRTC-R] errore canale Echo webrtc.' + sessionId);
                        if (!cancelled) {
                            setStato('error');
                            setErrore({
                                tipo: 'timeout_signaling',
                                messaggio: 'Canale signaling non disponibile.',
                                suggerimento: 'Verifica che Pusher sia configurato correttamente (PUSHER_APP_KEY, cluster).',
                            });
                        }
                    });
                } catch { /* Echo non connesso */ }
            }

            // ── 3. getUserMedia ─────────────────────────────────────────────
            console.log('[WebRTC-R] getUserMedia start...');
            let localStream: MediaStream;
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: true,
                });
                console.log('[WebRTC-R] getUserMedia ok — tracks:',
                    localStream.getTracks().map(t => `${t.kind}(${t.label})`).join(', '));
            } catch (err) {
                const errMedia = classificaErroreMedia(err);
                console.error('[WebRTC-R] getUserMedia fallito:', errMedia.tipo,
                    err instanceof DOMException ? err.name : String(err));
                if (!cancelled) {
                    setStato('error');
                    setErrore(errMedia);
                }
                pc.close();
                return;
            }

            if (cancelled) {
                localStream.getTracks().forEach(t => t.stop());
                pc.close();
                return;
            }

            localStreamRef.current = localStream;

            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
            }
            localStream.getTracks().forEach(t => pc.addTrack(t, localStream));

            // ── 4. Remote stream ────────────────────────────────────────────
            const remoteStream = new MediaStream();
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
            }
            pc.ontrack = (e) => {
                remoteStream.addTrack(e.track);
                if (!cancelled) setStato('connected');
            };

            // ── 5. ICE candidates → relay al chiosco ───────────────────────
            pc.onicecandidate = (e) => {
                if (e.candidate && sessionId) {
                    console.log('[WebRTC-R] ICE candidate locale →', e.candidate.type);
                    inviaSignalWebRtc(sessionId, 'ice-candidate', {
                        candidate: e.candidate.toJSON() as Record<string, unknown>,
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (cancelled) return;
                console.log('[WebRTC-R] connectionState:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    console.log('[WebRTC-R] P2P connesso');
                    setStato('connected');
                } else if (
                    pc.connectionState === 'failed' ||
                    pc.connectionState === 'disconnected'
                ) {
                    const errMedia = messaggioPeerFallito(pc.connectionState);
                    console.warn('[WebRTC-R] P2P', pc.connectionState, '→', errMedia.tipo);
                    setStato('error');
                    setErrore(errMedia);
                }
            };

            // ── 6. Media pronto — tenta offer (chiosco_ready potrebbe già esserci) ──
            mediaReady = true;
            await tryCreateOffer();

            // ── 7. Timeout se chiosco non risponde ─────────────────────────
            if (!chioscoReady) {
                readyTimeout = setTimeout(() => {
                    if (!cancelled && !chioscoReady) {
                        console.warn('[WebRTC-R] timeout: chiosco non risponde entro', CHIOSCO_READY_TIMEOUT_MS, 'ms');
                        setStato('error');
                        setErrore(TIMEOUT_MSG);
                    }
                }, CHIOSCO_READY_TIMEOUT_MS);
            }
        };

        avvia().catch(() => {
            if (!cancelled) {
                setStato('error');
                setErrore({
                    tipo: 'sconosciuto',
                    messaggio: 'Errore imprevisto nell\'avvio del parlato.',
                    suggerimento: 'Riprova. Se persiste, ricarica la pagina.',
                });
            }
        });

        console.groupEnd();

        return () => {
            cancelled = true;

            if (readyTimeout) {
                clearTimeout(readyTimeout);
                readyTimeout = null;
            }

            pcRef.current?.close();
            pcRef.current = null;

            if (channelRef.current && typeof window !== 'undefined' && window.Echo) {
                try { window.Echo.leave(`webrtc.${sessionId}`); } catch { /* ignore */ }
                channelRef.current = null;
            }

            // Ferma la condivisione schermo se attiva
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            setCondivisioneSchermo(false);

            // Pulisci errore condivisione e timer
            if (erroreCondivisioneTimerRef.current) {
                clearTimeout(erroreCondivisioneTimerRef.current);
                erroreCondivisioneTimerRef.current = null;
            }
            setErroreCondivisione(null);

            localStreamRef.current?.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;

            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

            setStato('idle');
            setErrore(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attivo, sessionId, chioscoId]);

    return {
        localVideoRef,
        remoteVideoRef,
        stato,
        errore,
        condivisioneSchermo,
        avviaCondivisione,
        fermaCondivisione,
        erroreCondivisione,
        clearErroreCondivisione,
    };
}
