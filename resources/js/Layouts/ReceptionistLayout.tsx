import { ReactNode, useEffect, useState } from 'react';
import { usePage, Link, router } from '@inertiajs/react';
import { SharedProps } from '@/types';

/**
 * Layout principale per Receptionist e Receptionist Lite.
 * Header dark con navigazione, profilo, logout.
 * Differenze R vs RL: il link "Dati" è visibile solo al Receptionist full.
 */
export default function ReceptionistLayout({ children }: { children: ReactNode }) {
    const page    = usePage<SharedProps>();
    const utente  = page.props.auth.utente;
    const flash   = page.props.flash;
    const profilo = utente?.profilo ?? 'receptionist_lite';
    const isRL    = profilo === 'receptionist_lite';

    const currentUrl      = page.url;
    const isPortineria    = currentUrl.startsWith('/portineria');
    const isPrenotazioni  = currentUrl.startsWith('/prenotazioni');
    const isRegolamento   = currentUrl.startsWith('/regolamento');

    const [flashMsg, setFlashMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
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

                    {/* Portineria — sempre presente */}
                    <NavLink href="/portineria" active={isPortineria}>
                        <MonitorIcon />
                        Portineria
                    </NavLink>

                    {/* Prenotazioni — solo Receptionist pieno (non RL) */}
                    {!isRL && (
                        <NavLink href="/prenotazioni" active={isPrenotazioni}>
                            <CalendarIcon />
                            Prenotazioni
                        </NavLink>
                    )}

                    {/* Regolamento — solo Receptionist pieno (sola lettura) */}
                    {!isRL && (
                        <NavLink href="/regolamento" active={isRegolamento}>
                            <BookIcon />
                            Regolamento
                        </NavLink>
                    )}
                </div>

                {/* Destra: badge profilo + username + logout */}
                <div className="flex items-center gap-4">

                    {/* Badge profilo */}
                    <span
                        className="rounded px-2 py-0.5 font-mono uppercase"
                        style={{
                            fontSize:        '9px',
                            letterSpacing:   '0.06em',
                            color:           isRL ? '#eab308' : '#22c55e',
                            backgroundColor: isRL ? 'rgba(234,179,8,0.1)' : 'rgba(34,197,94,0.1)',
                            border:          `1px solid ${isRL ? '#eab308' : '#22c55e'}40`,
                        }}
                    >
                        {isRL ? 'Lite' : 'R'}
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
            <main className="flex-1 overflow-hidden min-h-0">
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
            className="flex items-center gap-1.5 text-sm px-2 py-1 rounded transition-colors"
            style={{
                color:           active ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                backgroundColor: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                fontWeight:      active ? 500 : 400,
                borderBottom:    active ? '2px solid var(--color-parlato)' : '2px solid transparent',
                borderRadius:    active ? '4px 4px 0 0' : '4px',
                paddingBottom:   active ? '6px' : '4px',
            }}
        >
            {children}
        </Link>
    );
}

function BookIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
        </svg>
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

function MonitorIcon() {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
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
