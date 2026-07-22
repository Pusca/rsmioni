interface AzioneBtnProps {
    label: string;
    color: string;
    onClick: () => void;
    loading: boolean;
    icon: React.ReactNode;
}

export default function AzioneBtn({ label, color, onClick, loading, icon }: AzioneBtnProps) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg font-medium transition-all"
            style={{
                padding:         '8px 14px',
                fontSize:        '12px',
                color:           loading ? '#5c6380' : color,
                backgroundColor: loading ? 'var(--color-bg-secondary)' : `${color}18`,
                border:          `1px solid ${loading ? 'var(--color-border)' : color + '50'}`,
                cursor:          loading ? 'not-allowed' : 'pointer',
                whiteSpace:      'nowrap',
            }}
        >
            <span style={{ opacity: loading ? 0.4 : 1 }}>{icon}</span>
            {label}
        </button>
    );
}
