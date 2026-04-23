import { ReactNode, useEffect, useState } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import { SharedProps } from '@/types';

/**
 * Layout per il Gestore Hotel (Albergatore).
 * Header con navigazione: Prenotazioni, Camere (M5), Regolamento (M5).
 * Nessuna portineria né videochat.
 */
export default function GestoreHotelLayout({ children }: { children: ReactNode }) {
    const page    = usePage<SharedProps>();
    const utente  = page.props.auth.utente;
    const flash   = page.props.flash;
    const currentUrl = page.url;

    const [flashMsg, setFlashMsg]     = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    useEffect(() => {
        if (flash?.success) { setFlashMsg({ type: 'success', text: flash.success }); const t = setTimeout(() => setFlashMsg(null), 4000); return () => clearTimeout(t); }
        if (flash?.error)   { setFlashMsg({ type: 'error',   text: flash.error   }); const t = setTimeout(() => setFlashMsg(null), 6000); return () => clearTimeout(t); }
    }, [flash?.success, flash?.error]);

    const handleLogout = () => router.post('/logout');

    return (
        <div className="flex flex-col h-screen overflow-hidden"
             style={{ backgroundColor: 'var(--color-bg-primary)' }}>

            {/* ── Header ── */}
            <header
                className="flex items-center justify-between px-4 shrink-0 border-b"
                style={{
                    backgroundColor: 'var(--color-header)',
                    borderColor:     'var(--color-border)',
                    height:          '48px',
                }}
            >
                {/* Logo + Nav sinistra */}
                <div className="flex items-center gap-5">

                    {/* Logo */}
                    <span className="font-bold tracking-wide select-none" style={{ fontSize: '15px', color: '#fff' }}>
                        RS <span style={{ color: 'var(--color-parlato)' }}>Mioni</span>
                    </span>

                    <NavLink href="/prenotazioni" active={currentUrl.startsWith('/prenotazioni')}>
                        <CalendarIcon />
                        Prenotazioni
                    </NavLink>

                    <NavLink href="/camere" active={currentUrl.startsWith('/camere')}>
                        <BedIcon />
                        Camere
                    </NavLink>

                    <NavLink href="/regolamento" active={currentUrl.startsWith('/regolamento')}>
                        <DocumentIcon />
                        Regolamento
                    </NavLink>

                    <NavLink href="/configurazioni/hotel" active={currentUrl.startsWith('/configurazioni')}>
                        <SettingsIcon />
                        Configurazioni
                    </NavLink>
                </div>

                {/* Destra: badge profilo + username + logout */}
                <div className="flex items-center gap-4">

                    {/* Badge profilo */}
                    <span
                        className="rounded px-2 py-0.5 font-mono uppercase"
                        style={{
                            fontSize:        '9px',
                            letterSpacing:   '0.06em',
                            color:           '#3b82f6',
                            backgroundColor: 'rgba(59,130,246,0.1)',
                            border:          '1px solid rgba(59,130,246,0.4)',
                        }}
                    >
                        Albergatore
                    </span>

                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {utente?.username ?? '—'}
                    </span>

                    <button
                        onClick={handleLogout}
                        title="Esci"
                        className="flex items-center justify-center rounded transition-colors"
                        style={{
                            width:           '28px',
                            height:          '28px',
                            color:           'var(--color-text-muted)',
                            backgroundColor: 'transparent',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
                    >
                        <PowerIcon />
                    </button>
                </div>
            </header>

            {/* ── Flash banner ── */}
            {flashMsg && (
                <div
                    className="px-6 py-2.5 text-sm flex items-center justify-between shrink-0"
                    style={{
                        backgroundColor: flashMsg.type === 'success' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                        borderBottom:    `1px solid ${flashMsg.type === 'success' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
                        color:           flashMsg.type === 'success' ? '#22c55e' : '#ef4444',
                    }}
                >
                    <span>{flashMsg.text}</span>
                    <button onClick={() => setFlashMsg(null)} style={{ opacity: 0.6, marginLeft: '12px' }}>✕</button>
                </div>
            )}

            {/* ── Contenuto principale ── */}
            <main className="flex-1 overflow-auto min-h-0 p-6">
                {children}
            </main>
        </div>
    );
}

// ── Componenti interni ─────────────────────────────────────────────────────

function NavLink({
    href,
    active,
    children,
}: {
    href: string;
    active: boolean;
    children: React.ReactNode;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-1.5 text-sm px-2 rounded transition-colors"
            style={{
                color:           active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                backgroundColor: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                fontWeight:      active ? 500 : 400,
                borderBottom:    active ? '2px solid var(--color-parlato)' : '2px solid transparent',
                borderRadius:    active ? '4px 4px 0 0' : '4px',
                paddingTop:      '6px',
                paddingBottom:   active ? '6px' : '4px',
            }}
        >
            {children}
        </Link>
    );
}

function CalendarIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
    );
}

function BedIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <path d="M2 4v16M2 8h20v12H2M10 8V4" />
            <rect x="10" y="4" width="4" height="4" rx="1" />
        </svg>
    );
}

function DocumentIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10 9 9 9 8 9" />
        </svg>
    );
}

function SettingsIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
    );
}

function PowerIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
        </svg>
    );
}
