import { useEffect, useRef } from 'react';

/**
 * Miniatura fissa in alto a destra con la webcam del receptionist.
 *
 * Visibile quando il receptionist è operativo in portineria e il chiosco NON
 * è già in un collegamento video pieno (chiaro/parlato umano, che mostrano il
 * receptionist a schermo intero). Solo video, nessun audio.
 */

interface Props {
    track: MediaStreamTrack;
}

export default function PresenzaBadge({ track }: Props) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = new MediaStream([track]);
        el.play().catch(() => {});
        return () => { el.srcObject = null; };
    }, [track]);

    return (
        <div
            className="presenza-badge z-40 overflow-hidden rounded-xl border shadow-lg"
            style={{
                borderColor: 'rgba(34,197,94,0.45)',
                backgroundColor: 'rgba(15,23,42,0.85)',
            }}
        >
            <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="block w-full"
                style={{ aspectRatio: '4 / 3', objectFit: 'cover' }}
            />
            <div className="flex items-center gap-1.5 px-2 py-1">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: '#22c55e' }} />
                <span className="text-xs font-medium truncate" style={{ color: '#e2e8f0' }}>
                    Receptionist disponibile
                </span>
            </div>
        </div>
    );
}
