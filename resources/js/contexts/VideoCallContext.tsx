import { createContext, useContext, useState, useRef, useCallback, type ReactNode } from 'react';
import { chiudiSessioneCollegamento, cambiaStato } from '@/services/portineriaApi';
import type { TipoCollegamento } from '@/services/portineriaApi';

export interface ParkedCall {
    pc:           RTCPeerConnection;
    localStream:  MediaStream | null;
    remoteStream: MediaStream;
    sessionId:    string;
    chioscoId:    string;
    chioscoNome:  string;
    tipo:         TipoCollegamento;
}

interface VideoCallContextValue {
    parkedCall: ParkedCall | null;
    /** Park an active call (transfer ownership from hook to context). */
    parkCall:   (call: ParkedCall) => void;
    /** Reclaim a parked call (transfer ownership back to hook). Returns null if nothing parked. */
    reclaimCall: () => ParkedCall | null;
    /** Terminate a parked call (close PC, stop streams, notify backend). */
    endCall:    () => Promise<void>;
}

const Ctx = createContext<VideoCallContextValue | null>(null);

export function useVideoCall(): VideoCallContextValue {
    const ctx = useContext(Ctx);
    if (!ctx) throw new Error('useVideoCall must be inside VideoCallProvider');
    return ctx;
}

export function VideoCallProvider({ children }: { children: ReactNode }) {
    const [parkedCall, setParkedCall] = useState<ParkedCall | null>(null);
    const parkedRef = useRef<ParkedCall | null>(null);

    const parkCall = useCallback((call: ParkedCall) => {
        // Listen for remote disconnect while parked
        call.pc.onconnectionstatechange = () => {
            if (call.pc.connectionState === 'failed' || call.pc.connectionState === 'disconnected') {
                console.log('[PiP] connection lost while parked, cleaning up');
                cleanupCall(call);
                parkedRef.current = null;
                setParkedCall(null);
            }
        };
        parkedRef.current = call;
        setParkedCall(call);
    }, []);

    const reclaimCall = useCallback((): ParkedCall | null => {
        const call = parkedRef.current;
        if (!call) return null;
        parkedRef.current = null;
        setParkedCall(null);
        return call;
    }, []);

    const endCall = useCallback(async () => {
        const call = parkedRef.current;
        if (!call) return;
        parkedRef.current = null;
        setParkedCall(null);

        // Notify backend
        try {
            await chiudiSessioneCollegamento(call.sessionId, call.chioscoId);
            await cambiaStato(call.chioscoId, 'idle');
        } catch { /* best-effort */ }

        cleanupCall(call);
    }, []);

    return (
        <Ctx.Provider value={{ parkedCall, parkCall, reclaimCall, endCall }}>
            {children}
        </Ctx.Provider>
    );
}

function cleanupCall(call: ParkedCall) {
    try { call.pc.close(); } catch { /* ignore */ }
    call.localStream?.getTracks().forEach(t => t.stop());
    call.remoteStream.getTracks().forEach(t => t.stop());
}
