import { useEffect, useRef, useState } from 'react';
import { inviaSignalWebRtc } from '@/services/portineriaApi';
import { classificaErroreMedia, getIceServers, messaggioPeerFallito, patchSdp, type ErroreMedia } from '@/services/webrtcMedia';
import type { ParkedCall } from '@/contexts/VideoCallContext';

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
    sessionId:    string | null;
    tipo:         TipoCollegamento | null;
    attivo:       boolean;
    chioscoId?:   string | null;
    chioscoNome?: string | null;
    /** Park call to context instead of destroying on unmount. */
    parkCall?:    ((call: ParkedCall) => void) | null;
    /** Reclaim a previously parked call (returns null if none). */
    reclaimCall?: (() => ParkedCall | null) | null;
}

interface Result {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:  StatoCollegamento;
    errore: ErroreMedia | null;
    /** Screen sharing (solo chiaro) */
    condivisioneSchermo: boolean;
    avviaCondivisione:   () => Promise<void>;
    fermaCondivisione:   () => void;
}


export function useWebRtcCollegamento({ sessionId, tipo, attivo, chioscoId, chioscoNome, parkCall, reclaimCall }: Options): Result {
    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    const pcRef           = useRef<RTCPeerConnection | null>(null);
    const channelRef      = useRef<EchoChannel | null>(null);
    const localStreamRef  = useRef<MediaStream | null>(null);
    const remoteStreamRef = useRef<MediaStream | null>(null);
    const screenStreamRef = useRef<MediaStream | null>(null);
    const statoRef        = useRef<StatoCollegamento>('idle');

    const [stato,  setStato]  = useState<StatoCollegamento>('idle');
    const [errore, setErrore] = useState<ErroreMedia | null>(null);
    const [condivisioneSchermo, setCondivisioneSchermo] = useState(false);

    // ── Screen sharing (solo chiaro) ────────────────────────────────
    const avviaCondivisione = async () => {
        if (tipo !== 'chiaro' || !pcRef.current || !sessionId) return;
        try {
            const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
            const screenTrack = screenStream.getVideoTracks()[0];
            if (!screenTrack) { screenStream.getTracks().forEach(t => t.stop()); return; }

            const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
            if (!sender) { screenStream.getTracks().forEach(t => t.stop()); return; }

            await sender.replaceTrack(screenTrack);
            screenStreamRef.current = screenStream;
            if (localVideoRef.current) localVideoRef.current.srcObject = screenStream;
            setCondivisioneSchermo(true);

            inviaSignalWebRtc(sessionId, 'screen_share_started', {});

            screenTrack.addEventListener('ended', () => fermaCondivisione());
        } catch (err) {
            // User cancelled the picker — not an error
            console.log('[WebRTC-C:chiaro] screen share cancelled or failed:', err);
        }
    };

    const fermaCondivisione = () => {
        if (!pcRef.current || !sessionId) return;
        screenStreamRef.current?.getTracks().forEach(t => t.stop());
        screenStreamRef.current = null;

        // Restore webcam track
        const webcamTrack = localStreamRef.current?.getVideoTracks()[0];
        const sender = pcRef.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender && webcamTrack) {
            sender.replaceTrack(webcamTrack).catch(() => {});
        }
        if (localVideoRef.current && localStreamRef.current) {
            localVideoRef.current.srcObject = localStreamRef.current;
        }
        setCondivisioneSchermo(false);
        inviaSignalWebRtc(sessionId, 'screen_share_stopped', {});
    };

    // Keep statoRef in sync
    const updateStato = (s: StatoCollegamento) => { statoRef.current = s; setStato(s); };

    useEffect(() => {
        if (!attivo || !sessionId || !tipo) return;

        // ── Check for parked call to resume ─────────────────────────
        const parked = reclaimCall?.();
        if (parked && parked.sessionId === sessionId) {
            console.log(`[WebRTC-C:${tipo}] resuming parked call`);
            pcRef.current = parked.pc;
            localStreamRef.current = parked.localStream;
            remoteStreamRef.current = parked.remoteStream;

            if (localVideoRef.current && parked.localStream) {
                localVideoRef.current.srcObject = parked.localStream;
            }
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = parked.remoteStream;
            }

            // Restore connectionState handler
            parked.pc.onconnectionstatechange = () => {
                console.log(`[WebRTC-C:${tipo}] connectionState:`, parked.pc.connectionState);
                if (parked.pc.connectionState === 'connected') {
                    updateStato('connected');
                } else if (parked.pc.connectionState === 'failed' || parked.pc.connectionState === 'disconnected') {
                    const errMedia = messaggioPeerFallito(parked.pc.connectionState);
                    updateStato('error');
                    setErrore(errMedia);
                }
            };

            updateStato(parked.pc.connectionState === 'connected' ? 'connected' : 'connecting');

            // Cleanup for resumed call
            return () => {
                // Same park-or-destroy logic as below
                if (statoRef.current === 'connected' && parkCall && pcRef.current && remoteStreamRef.current && sessionId && chioscoId) {
                    console.log(`[WebRTC-C:${tipo}] parking resumed call`);
                    parkCall({
                        pc: pcRef.current,
                        localStream: localStreamRef.current,
                        remoteStream: remoteStreamRef.current,
                        sessionId,
                        chioscoId,
                        chioscoNome: chioscoNome ?? chioscoId,
                        tipo,
                    });
                    pcRef.current = null;
                    localStreamRef.current = null;
                    remoteStreamRef.current = null;
                } else {
                    pcRef.current?.close();
                    pcRef.current = null;
                    localStreamRef.current?.getTracks().forEach(t => t.stop());
                    localStreamRef.current = null;
                }
                if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
                if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
                updateStato('idle');
                setErrore(null);
            };
        } else if (parked) {
            // Parked call doesn't match current session — clean it up
            try { parked.pc.close(); } catch { /* ignore */ }
            parked.localStream?.getTracks().forEach(t => t.stop());
        }

        let cancelled    = false;
        let offerSent    = false;
        let mediaReady   = false;
        let chioscoReady = false;

        // Per 'nascosto' il receptionist non cattura media — mediaReady = true subito
        const needsMedia = tipo === 'chiaro';

        let readyTimeout: ReturnType<typeof setTimeout> | null = null;
        // Coda ICE lato receptionist: i candidati del chiosco possono arrivare
        // prima che l'answer imposti la remote description.
        let iceQueueR:       RTCIceCandidateInit[] = [];
        let remoteDescSetR = false;

        const tryCreateOffer = async () => {
            if (!mediaReady || !chioscoReady || offerSent || cancelled) return;
            const pc = pcRef.current;
            if (!pc) return;

            offerSent = true;
            updateStato('connecting');

            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                console.log(`[WebRTC-C:${tipo}] offer generata — lunghezza SDP:`, (offer.sdp ?? '').length, '| righe:', (offer.sdp ?? '').split(/\r?\n/).length);
                await inviaSignalWebRtc(sessionId, 'offer', {
                    type: offer.type,
                    sdp:  offer.sdp ?? '',
                });
            } catch {
                if (!cancelled) {
                    updateStato('error');
                    setErrore({
                        tipo: 'sconosciuto',
                        messaggio: 'Errore nella creazione dell\'offerta WebRTC.',
                        suggerimento: 'Riprova il collegamento.',
                    });
                }
            }
        };

        const avvia = async () => {
            updateStato('waiting_chiosco');
            setErrore(null);
            console.group(`[WebRTC-C:${tipo}] avvio sessione`, sessionId);

            // ── 1. ICE servers + RTCPeerConnection ──────────────────────────
            const iceServers = await getIceServers();
            const pc = new RTCPeerConnection({ iceServers });
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
                                const raw2 = sig.payload as unknown as RTCSessionDescriptionInit;
                                await pc.setRemoteDescription(
                                    new RTCSessionDescription({ ...raw2, sdp: patchSdp(raw2.sdp ?? '') }),
                                );
                                remoteDescSetR = true;
                                // Svuota coda ICE pre-answer
                                if (iceQueueR.length > 0) {
                                    console.log(`[WebRTC-C:${tipo}] flush coda ICE: ${iceQueueR.length} candidate`);
                                    for (const cand of iceQueueR) {
                                        try { await pc.addIceCandidate(new RTCIceCandidate(cand)); } catch { /* ignore */ }
                                    }
                                    iceQueueR = [];
                                }
                            } else if (sig.tipo === 'ice-candidate' && sig.payload.candidate) {
                                const cand = sig.payload.candidate as RTCIceCandidateInit;
                                if (remoteDescSetR) {
                                    await pc.addIceCandidate(new RTCIceCandidate(cand));
                                } else {
                                    console.log(`[WebRTC-C:${tipo}] ICE candidate accodato (pre-answer)`);
                                    iceQueueR.push(cand);
                                }
                            } else if (sig.tipo === 'sessione_chiusa') {
                                console.log(`[WebRTC-C:${tipo}] sessione_chiusa ricevuta`);
                                if (!cancelled) {
                                    updateStato('error');
                                    setErrore({
                                        tipo: 'connessione_interrotta',
                                        messaggio: 'Il chiosco ha chiuso la connessione.',
                                        suggerimento: 'Il collegamento è stato interrotto. Chiudi e riprova.',
                                    });
                                }
                            }
                        } catch { /* peer già chiuso o segnale malformato */ }
                    });

                    ch.error(() => {
                        console.error(`[WebRTC-C:${tipo}] errore canale Echo`);
                        if (!cancelled) {
                            updateStato('error');
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
                        updateStato('error');
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
            remoteStreamRef.current = remoteStream;
            if (remoteVideoRef.current) {
                remoteVideoRef.current.srcObject = remoteStream;
            }
            pc.ontrack = (e) => {
                remoteStream.addTrack(e.track);
                if (!cancelled) updateStato('connected');
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
                    updateStato('connected');
                } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
                    const errMedia = messaggioPeerFallito(pc.connectionState);
                    console.warn(`[WebRTC-C:${tipo}] P2P`, pc.connectionState);
                    updateStato('error');
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
                        updateStato('error');
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
                updateStato('error');
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

            // Park the call if it's connected and parkCall is available
            if (statoRef.current === 'connected' && parkCall && pcRef.current && remoteStreamRef.current && sessionId && chioscoId) {
                console.log(`[WebRTC-C:${tipo}] parking call for PiP`);
                parkCall({
                    pc: pcRef.current,
                    localStream: localStreamRef.current,
                    remoteStream: remoteStreamRef.current,
                    sessionId,
                    chioscoId,
                    chioscoNome: chioscoNome ?? chioscoId,
                    tipo: tipo!,
                });
                // Transfer ownership — don't destroy
                pcRef.current = null;
                localStreamRef.current = null;
                remoteStreamRef.current = null;
            } else {
                // Normal cleanup — destroy everything
                pcRef.current?.close();
                pcRef.current = null;

                localStreamRef.current?.getTracks().forEach(t => t.stop());
                localStreamRef.current = null;
                remoteStreamRef.current = null;
            }

            // Always stop screen share stream
            screenStreamRef.current?.getTracks().forEach(t => t.stop());
            screenStreamRef.current = null;
            setCondivisioneSchermo(false);

            if (channelRef.current && typeof window !== 'undefined' && window.Echo) {
                try { window.Echo.leave(`webrtc.${sessionId}`); } catch { /* ignore */ }
                channelRef.current = null;
            }

            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

            updateStato('idle');
            setErrore(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attivo, sessionId, tipo]);

    return { localVideoRef, remoteVideoRef, stato, errore, condivisioneSchermo, avviaCondivisione, fermaCondivisione };
}
