import { useEffect, useRef, useState } from 'react';
import { inviaSignalChiosco, getSessioneCorrente } from '@/services/kioskApi';
import {
    classificaErroreMedia,
    messaggioPeerFallito,
    type ErroreMedia,
} from '@/services/webrtcMedia';

// Tipo minimo — stesso pattern degli altri hook Reverb
interface EchoChannel {
    listen(event: string, callback: (data: unknown) => void): this;
    error(callback: (error: unknown) => void): this;
}

interface WebRtcSignalData {
    tipo:    'offer' | 'answer' | 'ice-candidate' | 'chiosco_ready' | 'sessione_chiusa'
           | 'screen_share_started' | 'screen_share_stopped';
    payload: Record<string, unknown>;
    mittente: 'receptionist' | 'chiosco';
}

interface SessioneCreataData {
    session_id: string;
    chiosco_id: string;
    tipo: 'chiaro' | 'nascosto' | 'parlato';
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

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Gestisce il ciclo di vita WebRTC lato chiosco.
 *
 * Effect 1 — abbona il canale chiosco.{chioscoId} per ricevere WebRtcSessionCreata.
 *   Al mount esegue anche un recovery: GET /kiosk/webrtc/sessione-corrente
 *   per recuperare sessioni create mentre il browser non era connesso a Reverb.
 *
 * Effect 2 — quando sessionId è non-null, avvia la negoziazione WebRTC:
 *   1. Abbonati a webrtc.{sessionId}  ← PRIMA di getUserMedia (fix race condition)
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

    // ── Effect 1: abbonamento al canale chiosco + recovery ─────────────────
    useEffect(() => {
        if (!chioscoId) return;

        let mounted = true;

        // Recovery: cerca sessione attiva anche senza Reverb
        // Gestisce il caso in cui il browser si apre dopo la creazione della sessione
        getSessioneCorrente().then(result => {
            if (mounted && result) {
                setSessionId(current => (current !== null ? current : result.session_id));
                setSessionTipo(current => (current !== null ? current : result.tipo));
            }
        });

        if (typeof window === 'undefined' || !window.Echo) return;

        let chioscoChannel: EchoChannel | null = null;

        try {
            chioscoChannel = window.Echo.private(
                `chiosco.${chioscoId}`,
            ) as unknown as EchoChannel;

            chioscoChannel.listen('.webrtc.sessione_creata', (raw: unknown) => {
                if (!mounted) return;
                const data = raw as SessioneCreataData;
                // Una nuova sessione sovrascrive sempre quella precedente
                setSessionId(data.session_id);
                setSessionTipo(data.tipo ?? 'parlato');
            });

            chioscoChannel.error(() => {
                // Canale non disponibile — il recovery HTTP ha già agito
            });
        } catch { /* Echo non connesso */ }

        return () => {
            mounted = false;
            if (typeof window !== 'undefined' && window.Echo) {
                try { window.Echo.leave(`chiosco.${chioscoId}`); } catch { /* ignore */ }
            }
        };
    }, [chioscoId]);

    // ── Effect 2: ciclo di vita RTCPeerConnection ──────────────────────────
    useEffect(() => {
        if (!sessionId || !chioscoId || !sessionTipo) return;

        let cancelled = false;
        let pc: RTCPeerConnection | null = null;
        let localStream: MediaStream | null = null;
        let webrtcChannel: EchoChannel | null = null;

        const cleanup = () => {
            if (cancelled) return; // già pulito
            cancelled = true;

            pc?.close();
            pc = null;

            localStream?.getTracks().forEach(t => t.stop());
            localStream = null;

            if (webrtcChannel && typeof window !== 'undefined' && window.Echo) {
                try { window.Echo.leave(`webrtc.${sessionId}`); } catch { /* ignore */ }
                webrtcChannel = null;
            }

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

            // ── 1. RTCPeerConnection ────────────────────────────────────────
            pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            console.log('[WebRTC-K] RTCPeerConnection creata');

            // ── 2. Abbonamento Echo PRIMA di getUserMedia ───────────────────
            //    Fix race condition: se l'offer arriva prima che getUserMedia
            //    risolva, la processiamo comunque appena siamo pronti.
            let offerPendente: RTCSessionDescriptionInit | null = null;

            if (typeof window !== 'undefined' && window.Echo) {
                try {
                    webrtcChannel = window.Echo.private(
                        `webrtc.${sessionId}`,
                    ) as unknown as EchoChannel;

                    webrtcChannel.listen('.webrtc.signal', async (raw: unknown) => {
                        if (cancelled || !pc) return;
                        const sig = raw as WebRtcSignalData;

                        if (sig.mittente === 'chiosco') return;

                        try {
                            if (sig.tipo === 'offer') {
                                if (localStream) {
                                    // getUserMedia già risolto: processa subito
                                    console.log('[WebRTC-K] offer ricevuta — processa subito');
                                    await processaOffer(sig.payload as unknown as RTCSessionDescriptionInit, pc);
                                } else {
                                    // getUserMedia non ancora risolto: salva per dopo
                                    console.log('[WebRTC-K] offer ricevuta — in attesa getUserMedia');
                                    offerPendente = sig.payload as unknown as RTCSessionDescriptionInit;
                                }
                            } else if (sig.tipo === 'ice-candidate' && sig.payload.candidate) {
                                console.log('[WebRTC-K] ICE candidate ricevuto dal receptionist');
                                await pc.addIceCandidate(
                                    new RTCIceCandidate(
                                        sig.payload.candidate as RTCIceCandidateInit,
                                    ),
                                );
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
                        } catch { /* peer già chiuso o segnale malformato */ }
                    });

                    webrtcChannel.error(() => {
                        console.error('[WebRTC-K] errore canale Echo webrtc.' + sessionId);
                        if (!cancelled) {
                            setStato('error');
                            setErrore({
                                tipo: 'timeout_signaling',
                                messaggio: 'Canale signaling non disponibile.',
                                suggerimento: 'Reverb è in esecuzione? Riavvia con: php artisan reverb:start',
                            });
                        }
                    });
                } catch { /* Echo non connesso */ }
            }

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

            pc.onconnectionstatechange = () => {
                if (cancelled || !pc) return;
                console.log('[WebRTC-K] connectionState:', pc.connectionState);
                if (pc.connectionState === 'connected') {
                    console.log('[WebRTC-K] P2P connesso');
                    setStato('connected');
                } else if (
                    pc.connectionState === 'failed' ||
                    pc.connectionState === 'disconnected'
                ) {
                    const errMedia = messaggioPeerFallito(pc.connectionState);
                    console.warn('[WebRTC-K] P2P', pc.connectionState, '→', errMedia.tipo);
                    if (!cancelled) {
                        setStato('error');
                        setErrore(errMedia);
                    }
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

        // Helper: riceve offer, crea answer, invia via signal
        const processaOffer = async (
            payload: RTCSessionDescriptionInit,
            pc: RTCPeerConnection,
        ) => {
            await pc.setRemoteDescription(new RTCSessionDescription(payload));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            console.log('[WebRTC-K] answer inviata');
            await inviaSignalChiosco(sessionId!, 'answer', {
                type: answer.type,
                sdp:  answer.sdp ?? '',
            });
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
