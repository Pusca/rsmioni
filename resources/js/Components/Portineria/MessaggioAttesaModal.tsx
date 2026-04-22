import { useState, useEffect, useRef } from 'react';

interface Props {
    isOpen: boolean;
    messaggioCorrente: string | null;
    nomeChiosco: string;
    onConferma: (messaggio: string) => void;
    onAnnulla: () => void;
    isLoading?: boolean;
}

export default function MessaggioAttesaModal({
    isOpen,
    messaggioCorrente,
    nomeChiosco,
    onConferma,
    onAnnulla,
    isLoading = false,
}: Props) {
    const [testo, setTesto] = useState('');
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (isOpen) {
            setTesto(messaggioCorrente ?? '');
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [isOpen, messaggioCorrente]);

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) onAnnulla(); }}
        >
            <div
                className="rounded-xl border w-full max-w-md mx-4"
                style={{
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderColor:     'var(--color-border)',
                    padding:         '24px',
                }}
            >
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h3 className="font-semibold" style={{ color: 'var(--color-text-primary)', fontSize: '15px' }}>
                            Messaggio di attesa
                        </h3>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {nomeChiosco}
                        </p>
                    </div>
                    <button
                        onClick={onAnnulla}
                        style={{ color: 'var(--color-text-muted)', fontSize: '18px', lineHeight: 1 }}
                    >
                        ×
                    </button>
                </div>

                {/* Textarea */}
                <textarea
                    ref={inputRef}
                    value={testo}
                    onChange={(e) => setTesto(e.target.value)}
                    placeholder="Es: Sono temporaneamente occupato. Torno tra 5 minuti. Grazie per la pazienza."
                    rows={4}
                    maxLength={500}
                    className="w-full rounded-lg border resize-none text-sm"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        borderColor:     'var(--color-border)',
                        color:           'var(--color-text-primary)',
                        padding:         '10px 12px',
                        outline:         'none',
                        fontFamily:      'inherit',
                        lineHeight:      1.5,
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                            e.preventDefault();
                            if (testo.trim()) onConferma(testo.trim());
                        }
                    }}
                />
                <p className="text-xs mt-1 text-right" style={{ color: 'var(--color-text-muted)' }}>
                    {testo.length}/500 · Ctrl+Invio per confermare
                </p>

                {/* Azioni */}
                <div className="flex gap-2 mt-4">
                    <button
                        onClick={onAnnulla}
                        disabled={isLoading}
                        className="flex-1 rounded-lg text-sm py-2 transition-colors"
                        style={{
                            backgroundColor: 'var(--color-bg-card)',
                            color:           'var(--color-text-secondary)',
                            border:          '1px solid var(--color-border)',
                        }}
                    >
                        Annulla
                    </button>
                    <button
                        onClick={() => { if (testo.trim()) onConferma(testo.trim()); }}
                        disabled={!testo.trim() || isLoading}
                        className="flex-1 rounded-lg text-sm py-2 font-medium transition-colors"
                        style={{
                            backgroundColor: testo.trim() && !isLoading ? '#9ba3c0' : '#2e3348',
                            color:           testo.trim() && !isLoading ? '#0f1117' : '#5c6380',
                        }}
                    >
                        {isLoading ? 'Invio...' : 'Imposta messaggio'}
                    </button>
                </div>
            </div>
        </div>
    );
}
