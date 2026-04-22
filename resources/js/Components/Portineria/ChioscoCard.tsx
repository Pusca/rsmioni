import { ChioscoConStato, StatoChiosco } from '@/types';
import BadgeStato from './BadgeStato';

interface Props {
    chiosco: ChioscoConStato;
    isSelezionato: boolean;
    puoInteragire: boolean;
    onClick: () => void;
}

/** Bordo colorato per stato attivo */
function borderColorForStato(stato: StatoChiosco): string {
    switch (stato) {
        case 'in_chiamata':      return '#ef4444';
        case 'in_chiaro':        return '#22c55e';
        case 'in_nascosto':      return '#eab308';
        case 'in_parlato':       return '#3b82f6';
        case 'messaggio_attesa': return '#5c6380';
        case 'idle':             return '#22c55e';
        default:                 return '#2e3348';
    }
}

/** Sfondo video-preview per stato */
function previewOverlay(stato: StatoChiosco) {
    switch (stato) {
        case 'offline':
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                        <path d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                    <span style={{ fontSize: '9px', color: '#5c6380' }}>OFFLINE</span>
                </div>
            );
        case 'in_chiamata':
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    {/* Pulse rings */}
                    <div className="relative flex items-center justify-center">
                        <div className="absolute animate-pulse-ring rounded-full"
                             style={{ width: 24, height: 24, border: '2px solid #ef4444', opacity: 0.6 }} />
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="#ef4444" className="animate-blink">
                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                        </svg>
                    </div>
                    <span style={{ fontSize: '9px', color: '#ef4444', fontWeight: 700 }} className="animate-blink">
                        CHIAMATA
                    </span>
                </div>
            );
        case 'in_chiaro':
        case 'in_nascosto':
        case 'in_parlato':
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    {/* Video placeholder — M2 WebRTC */}
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={stato === 'in_chiaro' ? '#22c55e' : stato === 'in_parlato' ? '#3b82f6' : '#eab308'} strokeWidth="1.5">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                    </svg>
                    <span style={{ fontSize: '8px', color: '#5c6380' }}>VIDEO M2</span>
                </div>
            );
        case 'messaggio_attesa':
            return (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9ba3c0" strokeWidth="1.5">
                        <path d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-4 4v-4z" />
                    </svg>
                    <span style={{ fontSize: '9px', color: '#9ba3c0' }}>MSG ATTESA</span>
                </div>
            );
        default: // idle
            return (
                <div className="absolute inset-0 flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#2e3348" strokeWidth="1.5">
                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                    </svg>
                </div>
            );
    }
}

export default function ChioscoCard({ chiosco, isSelezionato, puoInteragire, onClick }: Props) {
    const borderColor = isSelezionato
        ? '#3b82f6'
        : borderColorForStato(chiosco.stato);

    const isAttivo = !['offline', 'idle'].includes(chiosco.stato);

    return (
        <button
            onClick={onClick}
            className="w-full text-left rounded-lg border transition-all"
            style={{
                backgroundColor: isSelezionato ? '#1a2035' : 'var(--color-bg-card)',
                borderColor,
                borderWidth:    isSelezionato || isAttivo ? '2px' : '1px',
                padding:        '10px',
                outline:        'none',
                cursor:         'pointer',
            }}
        >
            {/* Header: hotel + badge stato */}
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs truncate mr-2" style={{ color: 'var(--color-text-muted)', maxWidth: '60%' }}>
                    {chiosco.hotel?.nome ?? '—'}
                </span>
                <BadgeStato stato={chiosco.stato} size="sm" />
            </div>

            {/* Nome chiosco */}
            <div className="font-semibold truncate mb-2" style={{ fontSize: '13px', color: 'var(--color-text-primary)' }}>
                {chiosco.nome}
            </div>

            {/* Video preview */}
            <div className="relative rounded mb-2 overflow-hidden"
                 style={{ aspectRatio: '16/9', backgroundColor: '#080a12' }}>
                {previewOverlay(chiosco.stato)}
            </div>

            {/* Footer: tipo + hw + azioni rapide */}
            <div className="flex items-center justify-between">
                {/* Tipo e hardware */}
                <div className="flex items-center gap-1.5" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                    <span className="uppercase font-mono" style={{ color: '#5c6380' }}>
                        {chiosco.tipo}
                    </span>
                    {chiosco.has_pos && (
                        <span title={`POS: ${chiosco.tipo_pos ?? '?'}`}
                              style={{ fontSize: '10px', color: chiosco.stato === 'offline' ? '#5c6380' : '#9ba3c0' }}>
                            POS
                        </span>
                    )}
                    {chiosco.has_stampante && (
                        <span title="Stampante" style={{ fontSize: '11px' }}>🖨</span>
                    )}
                </div>

                {/* Icone azioni (indicatori visivi — azione reale nell'AreaVideo) */}
                <div className="flex items-center gap-1">
                    {/* Occhio chiaro */}
                    {chiosco.interattivo && (
                        <span
                            title="Collegamento in chiaro"
                            className={chiosco.stato === 'in_chiaro' ? 'icon-active-chiaro' : ''}
                            style={{
                                fontSize: '11px',
                                opacity:  chiosco.stato === 'offline' ? 0.2 : (chiosco.stato === 'in_chiaro' ? 1 : 0.5),
                                lineHeight: 1,
                                paddingBottom: '1px',
                            }}
                        >
                            <EyeIcon />
                        </span>
                    )}
                    {/* Occhio nascosto */}
                    <span
                        title="Collegamento nascosto"
                        className={chiosco.stato === 'in_nascosto' ? 'icon-active-nascosto' : ''}
                        style={{
                            fontSize: '11px',
                            opacity:  chiosco.stato === 'offline' ? 0.2 : (chiosco.stato === 'in_nascosto' ? 1 : 0.5),
                            lineHeight: 1,
                            paddingBottom: '1px',
                        }}
                    >
                        <EyeOffIcon />
                    </span>
                    {/* Messaggio attesa */}
                    <span
                        title="Messaggio attesa"
                        className={chiosco.stato === 'messaggio_attesa' ? 'icon-active-attesa' : ''}
                        style={{
                            fontSize: '11px',
                            opacity:  chiosco.stato === 'offline' ? 0.2 : (chiosco.stato === 'messaggio_attesa' ? 1 : 0.4),
                            lineHeight: 1,
                            paddingBottom: '1px',
                        }}
                    >
                        <MsgIcon />
                    </span>
                </div>
            </div>
        </button>
    );
}

function EyeIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline' }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline' }}>
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
        </svg>
    );
}

function MsgIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'inline' }}>
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
    );
}
