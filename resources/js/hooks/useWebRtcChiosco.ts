import { useEffect, useRef, useState } from 'react';
import { inviaSignalChiosco, getSessioneCorrente, pollSignalsChiosco } from '@/services/kioskApi';
import {
    classificaErroreMedia,
    getIceServers,
    messaggioPeerFallito,
    patchSdp,
    type ErroreMedia,
} from '@/services/webrtcMedia';

interface WebRtcSignalData {
    tipo:    'offer' | 'answer' | 'ice-candidate' | 'chiosco_ready' | 'sessione_chiusa'
           | 'screen_share_started' | 'screen_share_stopped';
    payload: Record<string, unknown>;
    mittente: 'receptionist' | 'chiosco';
}

export type StatoParlatoChiosco = 'idle' | 'connecting' | 'connected' | 'error';

interface Options {
    chioscoId: string | null;
}

export interface ChioscoWebRtcResult {
    sessionId:          string | null;
    sessionTipo:        'chiaro' | 'nascosto' | 'parlato' | null;
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoParlatoChiosco;
    errore:             import('@/services/webrtcMedia').ErroreMedia | null;
    condivisioneAttiva: boolean;
}

/** Polling interval per scoperta sessione (ms) */
const SESSION_POLL_MS = 2_000;
/** Polling interval per segnali WebRTC (ms) */
const SIGNAL_POLL_MS = 1_000;


/**
 * Gestisce il ciclo di vita WebRTC lato chiosco.
 *
 * Signaling via HTTP polling (nessuna dipendenza da Pusher/Echo):
 *   - Scoperta sessione: polling GET /kiosk/webrtc/sessione-corrente ogni 2s
 *   - Segnali: polling GET /kiosk/webrtc/{sessionId}/poll ogni 1s
 *   - Invio segnali: POST /kiosk/webrtc/signal (invariato)
 *
 * Effect 1 — polling per scoprire nuove sessioni WebRTC.
 *   Al mount e ogni 2s chiama getSessioneCorrente().
 *   Quando trova una sessione, imposta sessionId e sessionTipo.
 *
 * Effect 2 — quando sessionId è non-null, avvia la negoziazione WebRTC:
 *   1. Avvia polling segnali
 *   2. getUserMedia
 *   3. Crea RTCPeerConnection, configura tracks, remote stream, ICE
 *   4. Invia 'chiosco_ready' al receptionist
 *   5. Riceve 'offer' → risponde con 'answer'
 *   6. ICE candidates bidirezionali
 *   7. 'sessione_chiusa' → cleanup
 */
export function useWebRtcChiosco({ chioscoId }: Options): ChioscoWebRtcResult {
    const [sessionId,          setSessionId]          = useState<string | null>(null);
    const [sessionTipo,        setSessionTipo]        = useState<'chiaro' | 'nascosto' | 'parlato' | null>(null);
    const [stato,              setStato]              = useState<StatoParlatoChiosco>('idle');
    const [errore,             setErrore]             = useState<ErroreMedia | null>(null);
    const [condivisioneAttiva, setCondivisioneAttiva] = useState(false);

    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    // ── Effect 1: polling per scoprire nuove sessioni ─────────────────────
    useEffect(() => {
        if (!chioscoId) return;

        let mounted = true;

        const poll = async () => {
            if (!mounted) return;
            const result = await getSessioneCorrente();
            if (mounted && result) {
                setSessionId(current => (current !== null ? current : result.session_id));
                setSessionTipo(current => (current !== null ? current : result.tipo));
            }
        };

        // Check immediato + polling ogni 2s
        poll();
        const intervalId = setInterval(poll, SESSION_POLL_MS);

        return () => {
            mounted = false;
            clearInterval(intervalId);
        };
    }, [chioscoId]);

    // ── Effect 2: ciclo di vita RTCPeerConnection ──────────────────────────
    useEffect(() => {
        if (!sessionId || !chioscoId || !sessionTipo) return;

        let cancelled = false;
        let pc: RTCPeerConnection | null = null;
        let localStream: MediaStream | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;

        const cleanup = () => {
            if (cancelled) return; // già pulito
            cancelled = true;

            if (pollTimer) {
                clearInterval(pollTimer);
                pollTimer = null;
            }

            pc?.close();
            pc = null;

            localStream?.getTracks().forEach(t => t.stop());
            localStream = null;

            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

            setStato('idle');
            setErrore(null);
            setCondivisioneAttiva(false);
            setSessionId(null);
            setSessionTipo(null);
        };

        const avvia = async () => {
            setStato('connecting');
            setErrore(null);
            console.group('[WebRTC-K] avvio sessione', sessionId);

            // ── 1. ICE servers + RTCPeerConnection ─────────────────────────
            const iceServers = await getIceServers();
            const hasRelay = iceServers.some(s =>
                (Array.isArray(s.urls) ? s.urls : [s.urls]).some(u => u.startsWith('turn:')));
            console.log('[WebRTC-K] ICE servers:', iceServers.length, '| TURN:', hasRelay,
                iceServers.map(s => Array.isArray(s.urls) ? s.urls[0] : s.urls));
            pc = new RTCPeerConnection({ iceServers });
            console.log('[WebRTC-K] RTCPeerConnection creata');

            // ── 2. Avvia polling segnali (PRIMA di getUserMedia) ───────────
            let offerPendente:  RTCSessionDescriptionInit | null = null;
            let iceQueue:       RTCIceCandidateInit[]            = [];
            let remoteDescSet = false;

            // Helper: riceve offer, crea answer, invia via signal.
            const processaOffer = async (
                payload: RTCSessionDescriptionInit,
                pcRef: RTCPeerConnection,
            ) => {
                console.log('[WebRTC-K] processaOffer — setRemoteDescription...', 'tipo:', payload.type, 'pc.signalingState:', pcRef.signalingState);
                const rawSdp = payload.sdp ?? '';
                console.log('[WebRTC-K] SDP ricevuto (prime 500 char):', rawSdp.substring(0, 500));
                console.log('[WebRTC-K] SDP lunghezza:', rawSdp.length, '| righe:', rawSdp.split(/\r?\n/).length);
                const patchedSdp = patchSdp(rawSdp);
                console.log('[WebRTC-K] SDP dopo patch lunghezza:', patchedSdp.length, '| righe:', patchedSdp.split(/\r?\n/).length);
                await pcRef.setRemoteDescription(new RTCSessionDescription({ ...payload, sdp: patchedSdp }));
                remoteDescSet = true;
                console.log('[WebRTC-K] setRemoteDescription OK — signalingState:', pcRef.signalingState);

                if (iceQueue.length > 0) {
                    console.log(`[WebRTC-K] flush coda ICE: ${iceQueue.length} candidate`);
                    for (const cand of iceQueue) {
                        try { await pcRef.addIceCandidate(new RTCIceCandidate(cand)); } catch (e) { console.warn('[WebRTC-K] ICE flush error:', e); }
                    }
                    iceQueue = [];
                }

                console.log('[WebRTC-K] createAnswer...');
                const answer = await pcRef.createAnswer();
                await pcRef.setLocalDescription(answer);
                console.log('[WebRTC-K] answer inviata');
                await inviaSignalChiosco(sessionId!, 'answer', {
                    type: answer.type,
                    sdp:  answer.sdp ?? '',
                });
            };

            // Handler per processare un singolo segnale
            const processaSignal = async (sig: WebRtcSignalData) => {
                if (cancelled || !pc) return;
                if (sig.mittente === 'chiosco') return;

                try {
                    if (sig.tipo === 'offer') {
                        if (localStream) {
                            console.log('[WebRTC-K] offer ricevuta — processa subito');
                            await processaOffer(sig.payload as unknown as RTCSessionDescriptionInit, pc);
                        } else {
                            console.log('[WebRTC-K] offer ricevuta — in attesa getUserMedia');
                            offerPendente = sig.payload as unknown as RTCSessionDescriptionInit;
                        }
                    } else if (sig.tipo === 'ice-candidate' && sig.payload.candidate) {
                        const cand = sig.payload.candidate as RTCIceCandidateInit;
                        if (remoteDescSet) {
                            console.log('[WebRTC-K] ICE candidate ricevuto dal receptionist');
                            await pc.addIceCandidate(new RTCIceCandidate(cand));
                        } else {
                            console.log('[WebRTC-K] ICE candidate accodato (pre-offer)');
                            iceQueue.push(cand);
                        }
                    } else if (sig.tipo === 'sessione_chiusa') {
                        console.log('[WebRTC-K] sessione_chiusa ricevuta');
                        cleanup();
                    } else if (sig.tipo === 'screen_share_started') {
                        console.log('[WebRTC-K] condivisione schermo avviata dal receptionist');
                        setCondivisioneAttiva(true);
                    } else if (sig.tipo === 'screen_share_stopped') {
                        console.log('[WebRTC-K] condivisione schermo terminata');
                        setCondivisioneAttiva(false);
                    }
                } catch (e) {
                    console.error('[WebRTC-K] signal handler error:', e);
                    if (sig.tipo === 'offer' && !cancelled) {
                        setStato('error');
                        setErrore({
                            tipo: 'sconosciuto',
                            messaggio: 'SDP dell\'offerta non accettato.',
                            suggerimento: 'Aggiorna la pagina del chiosco e riprova il collegamento.',
                        });
                        cleanup();
                    }
                }
            };

            // Avvia polling segnali
            pollTimer = setInterval(async () => {
                if (cancelled) return;
                try {
                    const signals = await pollSignalsChiosco(sessionId!);
                    for (const sig of signals) {
                        await processaSignal(sig as WebRtcSignalData);
                    }
                } catch { /* network error — riprova al prossimo ciclo */ }
            }, SIGNAL_POLL_MS);

            // ── 3. getUserMedia — audio solo per parlato ─────────────────────
            const needsAudio = sessionTipo === 'parlato';
            console.log(`[WebRTC-K] getUserMedia start (tipo=${sessionTipo}, audio=${needsAudio})...`);
            try {
                localStream = await navigator.mediaDevices.getUserMedia({
                    video: true,
                    audio: needsAudio,
                });
                console.log('[WebRTC-K] getUserMedia ok — tracks:',
                    localStream.getTracks().map(t => `${t.kind}(${t.label})`).join(', '));
            } catch (err) {
                const errMedia = classificaErroreMedia(err);
                console.error('[WebRTC-K] getUserMedia fallito:', errMedia.tipo,
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

            // Attacca stream locale al <video>
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = localStream;
            }
            localStream.getTracks().forEach(t => pc!.addTrack(t, localStream!));

            // ── 4. Remote stream ────────────────────────────────────────────
            const remoteStream = new MediaStream();
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
            }
            pc.ontrack = (e) => {
                remoteStream.addTrack(e.track);
                if (!cancelled) setStato('connected');
            };

            // ── 5. ICE candidates → relay al receptionist ──────────────────
            pc.onicecandidate = (e) => {
                if (e.candidate && sessionId) {
                    console.log('[WebRTC-K] ICE candidate locale →', e.candidate.type);
                    inviaSignalChiosco(sessionId, 'ice-candidate', {
                        candidate: e.candidate.toJSON() as Record<string, unknown>,
                    });
                }
            };

            pc.onicegatheringstatechange = () => {
                console.log('[WebRTC-K] iceGatheringState:', pc?.iceGatheringState);
            };
            pc.oniceconnectionstatechange = () => {
                console.log('[WebRTC-K] iceConnectionState:', pc?.iceConnectionState);
            };
            pc.onconnectionstatechange = () => {
                if (cancelled || !pc) return;
                console.log('[WebRTC-K] connectionState:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    console.log('[WebRTC-K] P2P connesso');
                    setStato('connected');
                } else if (pc.connectionState === 'failed') {
                    const errMedia = messaggioPeerFallito(pc.connectionState);
                    console.warn('[WebRTC-K] P2P failed →', errMedia.tipo);
                    if (!cancelled) {
                        setStato('error');
                        setErrore(errMedia);
                    }
                } else if (pc.connectionState === 'disconnected') {
                    console.warn('[WebRTC-K] P2P disconnected (transient?)');
                }
            };

            // ── 6. Processa offer pendente (arrivata prima di getUserMedia) ─
            if (offerPendente && pc) {
                console.log('[WebRTC-K] processa offer pendente');
                await processaOffer(offerPendente, pc);
                offerPendente = null;
            } else {
                // ── 7. Notifica il receptionist che siamo pronti ────────────
                console.log('[WebRTC-K] invia chiosco_ready');
                await inviaSignalChiosco(sessionId, 'chiosco_ready', {});
            }

            console.groupEnd();
        };

        avvia().catch(() => {
            if (!cancelled) {
                setStato('error');
                setErrore({
                    tipo: 'sconosciuto',
                    messaggio: 'Errore imprevisto nell\'avvio del parlato.',
                    suggerimento: 'Riprova. Se persiste, ricarica la pagina del chiosco.',
                });
            }
        });

        return () => {
            cleanup();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sessionId, sessionTipo]);

    return { sessionId, sessionTipo, localVideoRef, remoteVideoRef, stato, errore, condivisioneAttiva };
}
