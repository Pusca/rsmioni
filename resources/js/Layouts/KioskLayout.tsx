import { ReactNode } from 'react';

/**
 * Layout Kiosk — full screen, nessun menu, nessuna toolbar.
 * Usato dal profilo CHIOSCO in Chrome kiosk mode.
 * 100vw × 100vh, dark, nessuna scrollbar visibile.
 */
export default function KioskLayout({ children }: { children: ReactNode }) {
    return (
        <div className="w-screen h-screen overflow-hidden relative select-none"
             style={{ backgroundColor: 'var(--color-bg-primary)', color: 'var(--color-text-primary)' }}>
            {children}
        </div>
    );
}
