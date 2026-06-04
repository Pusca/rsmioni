import { useEffect, useRef } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { useVideoCall } from '@/contexts/VideoCallContext';

/**
 * Floating mini-video overlay shown when a video call is parked
 * (user navigated away from Portineria while a collegamento is active).
 */
export default function PipOverlay() {
    const { parkedCall, endCall } = useVideoCall();
    const videoRef = useRef<HTMLVideoElement>(null);
    const currentUrl = usePage().url;

    // Don't show on portineria (the full view handles it)
    const onPortineria = currentUrl.startsWith('/portineria');

    // Attach remote stream to video element
    useEffect(() => {
        if (!videoRef.current || !parkedCall) return;
        videoRef.current.srcObject = parkedCall.remoteStream;
    }, [parkedCall]);

    if (!parkedCall || onPortineria) return null;

    const tipoLabel = parkedCall.tipo === 'chiaro' ? 'In chiaro' : 'Nascosto';

    return (
        <div
            className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
            style={{
                bottom: '20px',
                right: '20px',
                width: '280px',
                border: '2px solid var(--color-border)',
                backgroundColor: '#050710',
            }}
        >
            {/* Video */}
            <div style={{ width: '280px', height: '210px', position: 'relative' }}>
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover"
                />
                {/* Badge stato */}
                <div
                    className="absolute top-2 left-2 flex items-center gap-1.5 rounded px-2 py-0.5 text-xs"
                    style={{
                        backgroundColor: 'rgba(0,0,0,0.7)',
                        color: parkedCall.tipo === 'chiaro' ? '#22c55e' : '#eab308',
                        backdropFilter: 'blur(4px)',
                    }}
                >
                    <span className="w-1.5 h-1.5 rounded-full animate-pulse"
                        style={{ backgroundColor: parkedCall.tipo === 'chiaro' ? '#22c55e' : '#eab308' }} />
                    {tipoLabel}
                </div>
            </div>

            {/* Controls bar */}
            <div
                className="flex items-center justify-between px-3 py-2"
                style={{ backgroundColor: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)' }}
            >
                <div className="min-w-0">
                    <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {parkedCall.chioscoNome}
                    </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                    <Link
                        href="/portineria"
                        className="rounded px-2 py-1 text-xs"
                        style={{ color: 'var(--color-parlato)', border: '1px solid rgba(59,130,246,0.3)' }}
                    >
                        Torna
                    </Link>
                    <button
                        onClick={endCall}
                        className="rounded px-2 py-1 text-xs"
                        style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                    >
                        Termina
                    </button>
                </div>
            </div>
        </div>
    );
}
