import { useEffect, useRef, useState } from 'react';
import { inviaSignalWebRtc } from '@/services/portineriaApi';
import { classificaErroreMedia, messaggioPeerFallito, type ErroreMedia } from '@/services/webrtcMedia';

/**
 * Gestisce il ciclo di vita WebRTC lato receptionist per
 * collegamento in chiaro e in nascosto.
 *
 * Differenza rispetto a useWebRtcParlato:
 *   - Nessun audio
 *   - in_nascosto: receptionist riceve video (recvonly), non invia
 *   - in_chiaro:   receptionist invia e riceve video (sendrecv)
 *
 * Ordine operazioni (stesso fix race condition di useWebRtcParlato):
 *   1. Crea RTCPeerConnection + transceiver video
 *   2. Abbonati a webrtc.{sessionId} via Echo  ← PRIMA di getUserMedia
 *   3. getUserMedia(video only) — solo per in_chiaro
 *   4. Configura tracks, remote stream, ICE handler
 *   5. Quando arriva 'chiosco_ready' E media pronto → crea offer
 *   6. Quando arriva 'answer' → setRemoteDescription
 *   7. ICE candidates bidirezionali
 */

export type TipoCollegamento = 'chiaro' | 'nascosto';
export type StatoCollegamento = 'idle' | 'waiting_chiosco' | 'connecting' | 'connected' | 'error';

const CHIOSCO_READY_TIMEOUT_MS = 20_000;

interface EchoChannel {
    listen(event: string, callback: (data: unknown) => void): this;
    error(callback: (error: unknown) => void): this;
}

interface WebRtcSignalData {
    tipo:     'offer' | 'answer' | 'ice-candidate' | 'chiosco_ready' | 'sessione_chiusa';
    payload:  Record<string, unknown>;
    mittente: 'receptionist' | 'chiosco';
}

interface Options {
    sessionId: string | null;
    tipo:      TipoCollegamento | null;
    attivo:    boolean;
}

interface Result {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:  StatoCollegamento;
    errore: ErroreMedia | null;
}

const ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

export function useWebRtcCollegamento({ sessionId, tipo, attivo }: Options): Result {
    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const pcRef          = useRef<RTCPeerConnection | null>(null);
    const channelRef     = useRef<EchoChannel | null>(null);
    const localStreamRef = useRef<MediaStream | null>(null);

    const [stato,  setStato]  = useState<StatoCollegamento>('idle');
    const [errore, setErrore] = useState<ErroreMedia | null>(null);

    useEffect(() => {
        if (!attivo || !sessionId || !tipo) return;

        let cancelled    = false;
        let offerSent    = false;
        let mediaReady   = false;
        let chioscoReady = false;

        // Per 'nascosto' il receptionist non cattura media — mediaReady = true subito
        const needsMedia = tipo === 'chiaro';

        let readyTimeout: ReturnType<typeof setTimeout> | null = null;

        const tryCreateOffer = async () => {
            if (!mediaReady || !chioscoReady || offerSent || cancelled) return;
            const pc = pcRef.current;
            if (!pc) return;

            offerSent = true;
            setStato('connecting');

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log(`[WebRTC-C:${tipo}] offer inviata`);
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
                        suggerimento: 'Riprova il collegamento.',
                    });
                }
            }
        };

        const avvia = async () => {
            setStato('waiting_chiosco');
            setErrore(null);
            console.group(`[WebRTC-C:${tipo}] avvio sessione`, sessionId);

            // ── 1. RTCPeerConnection ─────────────────────────────────────────
            const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
            pcRef.current = pc;

            // Configura il transceiver video in base al tipo
            if (tipo === 'nascosto') {
                // Receptionist riceve solo — il chiosco invia
                pc.addTransceiver('video', { direction: 'recvonly' });
                console.log('[WebRTC-C:nascosto] transceiver recvonly configurato');
            }
            // Per 'chiaro': il video track viene aggiunto dopo getUserMedia (sendrecv automatico)

            // ── 2. Abbonamento Echo PRIMA di getUserMedia ────────────────────
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
                                console.log(`[WebRTC-C:${tipo}] chiosco_ready ricevuto`);
                                if (readyTimeout) { clearTimeout(readyTimeout); readyTimeout = null; }
                                chioscoReady = true;
                                await tryCreateOffer();
                            } else if (sig.tipo === 'answer') {
                                console.log(`[WebRTC-C:${tipo}] answer ricevuta`);
                                await pc.setRemoteDescription(
                                    new RTCSessionDescription(
                                        sig.payload as unknown as RTCSessionDescriptionInit,
                                    ),
                                );
                            } else if (sig.tipo === 'ice-candidate' && sig.payload.candidate) {
                                await pc.addIceCandidate(
                                    new RTCIceCandidate(sig.payload.candidate as RTCIceCandidateInit),
                                );
                            } else if (sig.tipo === 'sessione_chiusa') {
                                console.log(`[WebRTC-C:${tipo}] sessione_chiusa ricevuta`);
                            }
                        } catch { /* peer già chiuso o segnale malformato */ }
                    });

                    ch.error(() => {
                        console.error(`[WebRTC-C:${tipo}] errore canale Echo`);
                        if (!cancelled) {
                            setStato('error');
                            setErrore({
                                tipo: 'timeout_signaling',
                                messaggio: 'Canale signaling non disponibile.',
                                suggerimento: 'Verifica che Pusher sia configurato correttamente e il browser del chiosco sia aperto su /kiosk.',
                            });
                        }
                    });
                } catch { /* Echo non connesso */ }
            }

            // ── 3. getUserMedia — solo per in_chiaro ─────────────────────────
            if (needsMedia) {
                console.log('[WebRTC-C:chiaro] getUserMedia video start...');
                try {
                    const localStream = await navigator.mediaDevices.getUserMedia({
                        video: true,
                        audio: false,
                    });
                    console.log('[WebRTC-C:chiaro] getUserMedia ok —',
                        localStream.getVideoTracks().map(t => t.label).join(', '));

                    if (cancelled) {
                        localStream.getTracks().forEach(t => t.stop());
                        pc.close();
                        return;
                    }

                    localStreamRef.current = localStream;
                    if (localVideoRef.current) {
                        localVideoRef.current.srcObject = localStream;
                    }
                    localStream.getVideoTracks().forEach(t => pc.addTrack(t, localStream));
                } catch (err) {
                    const errMedia = classificaErroreMedia(err);
                    console.error('[WebRTC-C:chiaro] getUserMedia fallito:', errMedia.tipo);
                    if (!cancelled) {
                        setStato('error');
                        setErrore(errMedia);
                    }
                    pc.close();
                    return;
                }
            } else {
                // Nascosto: il receptionist non cattura media, è subito pronto
                if (localVideoRef.current) {
                    localVideoRef.current.srcObject = null;
                }
            }

            // ── 4. Remote stream (video dal chiosco) ─────────────────────────
            const remoteStream = new MediaStream();
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
            }
            pc.ontrack = (e) => {
                remoteStream.addTrack(e.track);
                if (!cancelled) setStato('connected');
                console.log(`[WebRTC-C:${tipo}] remote track ricevuto:`, e.track.kind);
            };

            // ── 5. ICE candidates → relay al chiosco ─────────────────────────
            pc.onicecandidate = (e) => {
                if (e.candidate && sessionId) {
                    console.log(`[WebRTC-C:${tipo}] ICE candidate locale →`, e.candidate.type);
                    inviaSignalWebRtc(sessionId, 'ice-candidate', {
                        candidate: e.candidate.toJSON() as Record<string, unknown>,
                    });
                }
            };

            pc.onconnectionstatechange = () => {
                if (cancelled) return;
                console.log(`[WebRTC-C:${tipo}] connectionState:`, pc.connectionState);
                if (pc.connectionState === 'connected') {
                    setStato('connected');
                } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    const errMedia = messaggioPeerFallito(pc.connectionState);
                    console.warn(`[WebRTC-C:${tipo}] P2P`, pc.connectionState);
                    setStato('error');
                    setErrore(errMedia);
                }
            };

            // ── 6. Media pronto → tenta offer ────────────────────────────────
            mediaReady = true; // sempre true per nascosto; true dopo getUserMedia per chiaro
            await tryCreateOffer();

            // ── 7. Timeout chiosco_ready ──────────────────────────────────────
            if (!chioscoReady) {
                readyTimeout = setTimeout(() => {
                    if (!cancelled && !chioscoReady) {
                        console.warn(`[WebRTC-C:${tipo}] timeout: chiosco non risponde`);
                        setStato('error');
                        setErrore({
                            tipo: 'timeout_signaling',
                            messaggio: 'Il chiosco non risponde al segnale.',
                            suggerimento:
                                'Verifica che il browser del chiosco sia aperto su /kiosk, ' +
                                'Pusher configurato, ' +
                                'ed entrambi i browser aperti su /kiosk e /portineria.',
                        });
                    }
                }, CHIOSCO_READY_TIMEOUT_MS);
            }

            console.groupEnd();
        };

        avvia().catch(() => {
            if (!cancelled) {
                setStato('error');
                setErrore({
                    tipo: 'sconosciuto',
                    messaggio: 'Errore imprevisto nell\'avvio del collegamento.',
                    suggerimento: 'Riprova il collegamento.',
                });
            }
        });

        return () => {
            cancelled = true;

            if (readyTimeout) { clearTimeout(readyTimeout); readyTimeout = null; }

            pcRef.current?.close();
            pcRef.current = null;

            if (channelRef.current && typeof window !== 'undefined' && window.Echo) {
                try { window.Echo.leave(`webrtc.${sessionId}`); } catch { /* ignore */ }
                channelRef.current = null;
            }

            localStreamRef.current?.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;

            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

            setStato('idle');
            setErrore(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attivo, sessionId, tipo]);

    return { localVideoRef, remoteVideoRef, stato, errore };
}
