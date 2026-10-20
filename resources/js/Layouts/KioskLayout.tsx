import { ReactNode } from 'react';
import { router, usePage } from '@inertiajs/react';
import { SharedProps } from '@/types';

/**
 * Layout Kiosk — full screen, nessun menu, nessuna toolbar.
 * Usato dal profilo CHIOSCO in Chrome kiosk mode.
 * 100vw × 100vh, dark, nessuna scrollbar visibile.
 * Il pulsante di ritorno compare solo se si è entrati dalla scheda demo.
 */
export default function KioskLayout({ children }: { children: ReactNode }) {
    const prova = usePage<SharedProps>().props.demo_ritorno;

    return (
        <div className="w-screen kiosk-root overflow-hidden relative select-none"
             style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
            {prova && (
                <button
                    type="button"
                    onClick={() => router.post('/demo/torna')}
                    className="absolute top-3 right-3 z-50 rounded px-3 py-1.5 text-xs"
                    style={{ backgroundColor: 'rgba(15,23,42,0.85)', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.45)' }}
                >
                    Torna alla scheda demo
                </button>
            )}
            {children}
        </div>
    );
}
