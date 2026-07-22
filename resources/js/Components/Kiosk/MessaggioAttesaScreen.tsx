import { Chiosco } from '@/types';

// ── MessaggioAttesaScreen ────────────────────────────────────────────────────
// Il receptionist ha impostato un messaggio di attesa.

interface MessaggioAttesaScreenProps {
    chiosco:  Chiosco;
    messaggio: string | null;
}

export default function MessaggioAttesaScreen({ chiosco, messaggio }: MessaggioAttesaScreenProps) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-8">

            {/* Icona messaggio */}
            <div className="rounded-full flex items-center justify-center"
                 style={{
                     width:           80,
                     height:          80,
                     backgroundColor: 'rgba(155,163,192,0.08)',
                     border:          '2px solid rgba(155,163,192,0.3)',
                 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                     stroke="#9ba3c0" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
            </div>

            {/* Messaggio */}
            <div className="text-center max-w-lg">
                <p className="text-sm uppercase tracking-widest mb-4"
                   style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
                    Messaggio del receptionist
                </p>

                {messaggio ? (
                    <p className="text-xl font-light leading-relaxed"
                       style={{ color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                        {messaggio}
                    </p>
                ) : (
                    <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                        Il receptionist tornerà disponibile a breve.
                    </p>
                )}

                <p className="text-sm mt-6" style={{ color: 'var(--color-text-muted)' }}>
                    Reception will be available shortly.
                </p>
            </div>

            {/* Info — bottom left, solo dev */}
            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · messaggio_attesa
                </div>
            )}
        </div>
    );
}
