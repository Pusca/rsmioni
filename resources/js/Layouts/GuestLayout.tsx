import { ReactNode } from 'react';

/**
 * Layout per pagine pubbliche (login).
 * Sfondo dark full-screen, contenuto centrato.
 */
export default function GuestLayout({ children }: { children: ReactNode }) {
    return (
        <div className="min-h-screen flex items-center justify-center"
             style={{ backgroundColor: 'var(--color-bg-primary)' }}>
            <div className="w-full max-w-md px-6">
                {children}
            </div>
        </div>
    );
}
