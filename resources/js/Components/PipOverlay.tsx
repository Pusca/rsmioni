import { useEffect, useRef, useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { useLiveKitCall } from '@/hooks/useLiveKitCall';
import * as liveKitCall from '@/services/liveKitCall';
import { cambiaStato } from '@/services/portineriaApi';
import CatturaDocumento from './Portineria/CatturaDocumento';

/**
 * Riquadro video flottante (PiP) mostrato quando una videochiamata LiveKit è
 * attiva e l'utente NON è sulla pagina Portineria (la chiamata persiste navigando,
 * es. su /prenotazioni). Legge dal gestore singleton liveKitCall.
 */
export default function PipOverlay() {
    const snap     = useLiveKitCall();
    const videoRef = useRef<HTMLVideoElement>(null);
    const currentUrl = usePage().url;
    const [showCattura, setShowCattura] = useState(false);

    // Il PiP mostra la chiamata ATTIVA
    const call = snap.activeChioscoId ? snap.calls[snap.activeChioscoId] : undefined;
    const onPortineria = currentUrl.startsWith('/portineria');
    const attivo = !!call && (call.stato === 'connecting' || call.stato === 'connected');

    // Aggancia la track remota dell'attiva al video del PiP
    useEffect(() => {
        if (videoRef.current) liveKitCall.attachRemote(videoRef.current);
    }, [call?.stato, call?.condivisione, call?.sessionId, call?.remoteVer]);

    if (!attivo || onPortineria || !call) return null;

    const colore = call.tipo === 'parlato' ? '#3b82f6'
                 : call.tipo === 'nascosto' ? '#eab308'
                 : '#22c55e';
    const tipoLabel = call.tipo === 'parlato' ? 'In parlato'
                    : call.tipo === 'nascosto' ? 'Nascosto'
                    : 'In chiaro';

    const termina = async () => {
        const cid = call.chioscoId;
        await liveKitCall.stopCall(cid);
        try { await cambiaStato(cid, 'idle'); } catch { /* best-effort */ }
    };

    return (
        <div
            className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
            style={{ bottom: '20px', right: '20px', width: '280px', border: `2px solid ${colore}55`, backgroundColor: '#050710' }}
        >
            {/* Video */}
            <div style={{ width: '280px', height: '210px', position: 'relative' }}>
                <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                <div
                    className="absolute top-2 left-2 flex items-center gap-1.5 rounded px-2 py-0.5 text-xs"
                    style={{ backgroundColor: 'rgba(0,0,0,0.7)', color: colore, backdropFilter: 'blur(4px)' }}
                >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: colore }} />
                    {tipoLabel}
                </div>
            </div>

            {/* Controlli */}
            <div className="px-3 py-2" style={{ backgroundColor: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)' }}>
                <div className="flex items-center justify-between">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {call.chioscoNome ?? 'Chiosco'}
                    </p>
                    <div className="flex items-center gap-1.5 shrink-0">
                        <Link href="/portineria" className="rounded px-2 py-1 text-xs"
                              style={{ color: 'var(--color-parlato)', border: '1px solid rgba(59,130,246,0.3)' }}>
                            Torna
                        </Link>
                        <button onClick={termina} className="rounded px-2 py-1 text-xs"
                                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                            Termina
                        </button>
                    </div>
                </div>
                {call.stato === 'connected' && (
                    <button onClick={() => setShowCattura(true)}
                            className="w-full mt-2 rounded px-2 py-1.5 text-xs font-medium"
                            style={{ color: '#fff', backgroundColor: 'var(--color-parlato)' }}>
                        Acquisisci documento
                    </button>
                )}
            </div>

            {showCattura && <CatturaDocumento onClose={() => setShowCattura(false)} />}
        </div>
    );
}
