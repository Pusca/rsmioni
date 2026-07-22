import { Chiosco } from '@/types';

// ── ChiamataInCorsoScreen ────────────────────────────────────────────────────
// Il guest ha chiamato — attende che il receptionist risponda.

interface ChiamataInCorsoScreenProps {
    chiosco:   Chiosco;
    onAnnulla: () => void;
}

export default function ChiamataInCorsoScreen({ chiosco, onAnnulla }: ChiamataInCorsoScreenProps) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-8">

            {/* Cerchi animati pulsanti */}
            <div className="relative flex items-center justify-center"
                 style={{ width: 120, height: 120 }}>
                <div className="absolute inset-0 rounded-full animate-pulse-ring"
                     style={{ border: '2px solid rgba(34,197,94,0.5)', opacity: 0.6 }} />
                <div className="absolute inset-0 rounded-full animate-pulse-ring"
                     style={{ border: '2px solid rgba(34,197,94,0.3)', opacity: 0.3, animationDelay: '0.5s' }} />
                <div className="absolute inset-0 rounded-full animate-pulse-ring"
                     style={{ border: '2px solid rgba(34,197,94,0.15)', opacity: 0.15, animationDelay: '1s' }} />
                <div className="absolute inset-0 rounded-full flex items-center justify-center"
                     style={{
                         backgroundColor: 'rgba(34,197,94,0.12)',
                         border:          '2px solid rgba(34,197,94,0.5)',
                     }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="#22c55e" className="animate-blink">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                </div>
            </div>

            {/* Testo */}
            <div className="text-center px-8">
                <p className="text-2xl font-light mb-2" style={{ color: 'var(--color-text-primary)' }}>
                    Chiamata in corso…
                </p>
                <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                    In attesa di risposta dal receptionist
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Waiting for reception to answer
                </p>
            </div>

            {/* Annulla — solo touch (per analogico non ha senso) */}
            {chiosco.tipo === 'touch' && (
                <button
                    onClick={onAnnulla}
                    className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                    style={{
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        border:          '1px solid rgba(239,68,68,0.3)',
                        color:           '#ef4444',
                        cursor:          'pointer',
                    }}
                >
                    Annulla chiamata
                </button>
            )}

            {/* Info — bottom left, solo dev */}
            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · in_chiamata
                </div>
            )}
        </div>
    );
}
