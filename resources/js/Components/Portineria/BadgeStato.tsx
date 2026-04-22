import { StatoChiosco } from '@/types';

interface Props {
    stato: StatoChiosco;
    size?: 'sm' | 'md';
    className?: string;
}

const CONFIG: Record<StatoChiosco, {
    label: string;
    color: string;
    bg: string;
    dot: string;
    blink?: boolean;
}> = {
    offline:          { label: 'OFFLINE',           color: '#5c6380', bg: 'rgba(92,99,128,0.15)',   dot: '#5c6380' },
    idle:             { label: 'DISPONIBILE',        color: '#22c55e', bg: 'rgba(34,197,94,0.12)',   dot: '#22c55e' },
    in_chiamata:      { label: 'CHIAMATA',           color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   dot: '#ef4444', blink: true },
    in_chiaro:        { label: 'IN CHIARO',          color: '#22c55e', bg: 'rgba(34,197,94,0.15)',   dot: '#22c55e' },
    in_nascosto:      { label: 'IN NASCOSTO',        color: '#eab308', bg: 'rgba(234,179,8,0.15)',   dot: '#eab308' },
    in_parlato:       { label: 'IN PARLATO',         color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  dot: '#3b82f6' },
    messaggio_attesa: { label: 'MSG ATTESA',         color: '#9ba3c0', bg: 'rgba(155,163,192,0.15)', dot: '#9ba3c0' },
};

export default function BadgeStato({ stato, size = 'sm', className = '' }: Props) {
    const cfg = CONFIG[stato] ?? CONFIG.offline;
    const isSmall = size === 'sm';

    return (
        <span
            className={`inline-flex items-center gap-1 rounded font-mono font-semibold uppercase tracking-wider ${className}`}
            style={{
                fontSize:       isSmall ? '9px' : '10px',
                padding:        isSmall ? '2px 5px' : '3px 7px',
                color:          cfg.color,
                backgroundColor: cfg.bg,
                border:         `1px solid ${cfg.color}40`,
            }}
        >
            <span
                className={cfg.blink ? 'animate-blink' : ''}
                style={{
                    width:           isSmall ? '5px' : '6px',
                    height:          isSmall ? '5px' : '6px',
                    borderRadius:    '50%',
                    backgroundColor: cfg.dot,
                    flexShrink:      0,
                    display:         'block',
                }}
            />
            {cfg.label}
        </span>
    );
}
