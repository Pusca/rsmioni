import { FormEvent, useRef, useState } from 'react';

interface Props {
    documentoId:     string;
    titoloDocumento: string | null;
    onClose:         () => void;
}

type Fase = 'form' | 'invio' | 'completata' | 'errore';

function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export default function ModalInvioDocumento({ documentoId, titoloDocumento, onClose }: Props) {
    const [fase,     setFase]     = useState<Fase>('form');
    const [email,    setEmail]    = useState('');
    const [testo,    setTesto]    = useState('');
    const [errore,   setErrore]   = useState<string | null>(null);
    const emailRef = useRef<HTMLInputElement>(null);

    const handleInvia = async (e: FormEvent) => {
        e.preventDefault();
        if (! email.trim()) return;

        setFase('invio');
        setErrore(null);

        try {
            const res = await fetch(`/documenti/${documentoId}/invia`, {
                method:  'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept':       'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    email: email.trim(),
                    testo: testo.trim() || null,
                }),
            });

            const data = await res.json() as { ok?: boolean; errore?: string; message?: string; errors?: Record<string, string[]> };

            if (! res.ok) {
                const msg = data.errore
                    ?? data.message
                    ?? (data.errors ? Object.values(data.errors).flat()[0] : null)
                    ?? 'Errore imprevisto durante l\'invio.';
                throw new Error(msg);
            }

            setFase('completata');
        } catch (err) {
            setFase('errore');
            setErrore(err instanceof Error ? err.message : 'Errore di rete.');
        }
    };

    const handleRiprova = () => {
        setFase('form');
        setErrore(null);
        setTimeout(() => emailRef.current?.focus(), 50);
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={e => { if (e.target === e.currentTarget && fase !== 'invio') onClose(); }}
        >
            <div
                className="w-full max-w-md rounded-xl p-6 shadow-2xl"
                style={{ backgroundColor: '#0d1020', border: '1px solid #1a1d27' }}
            >
                {/* Intestazione */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Invia documento via email
                        </h2>
                        {titoloDocumento && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                {titoloDocumento}
                            </p>
                        )}
                    </div>
                    {fase !== 'invio' && (
                        <button onClick={onClose}
                            className="text-xs rounded px-2 py-1"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            ✕
                        </button>
                    )}
                </div>

                {/* ── FASE: form ── */}
                {fase === 'form' && (
                    <form onSubmit={handleInvia} className="space-y-4">
                        {/* Email */}
                        <div>
                            <label className="block text-xs mb-1 font-medium"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Email destinatario *
                            </label>
                            <input
                                ref={emailRef}
                                type="email"
                                value={email}
                                onChange={e => setEmail(e.target.value)}
                                required
                                autoFocus
                                placeholder="ospite@esempio.com"
                                className="w-full rounded px-3 py-2 text-xs outline-none"
                                style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-parlato)')}
                                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                            />
                        </div>

                        {/* Testo opzionale */}
                        <div>
                            <label className="block text-xs mb-1"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Messaggio personalizzato (opzionale)
                            </label>
                            <textarea
                                value={testo}
                                onChange={e => setTesto(e.target.value)}
                                rows={3}
                                placeholder="Gentile ospite, le inviamo il documento richiesto…"
                                className="w-full rounded px-3 py-2 text-xs outline-none resize-none"
                                style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                }}
                                onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-parlato)')}
                                onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                            />
                        </div>

                        {/* Nota link temporaneo */}
                        <p className="text-xs rounded px-3 py-2"
                            style={{ color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            Il destinatario riceverà un link temporaneo valido 48 ore.
                            Il documento non viene allegato all'email.
                        </p>

                        {/* Azioni */}
                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button type="button" onClick={onClose}
                                className="rounded px-4 py-1.5 text-xs"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                Annulla
                            </button>
                            <button type="submit"
                                disabled={! email.trim()}
                                className="rounded px-4 py-1.5 text-xs font-medium"
                                style={{
                                    backgroundColor: email.trim() ? 'var(--color-parlato)' : 'rgba(59,130,246,0.2)',
                                    color: '#fff',
                                    opacity: email.trim() ? 1 : 0.5,
                                    cursor: email.trim() ? 'pointer' : 'not-allowed',
                                }}>
                                Invia email
                            </button>
                        </div>
                    </form>
                )}

                {/* ── FASE: invio ── */}
                {fase === 'invio' && (
                    <div className="flex flex-col items-center py-8 gap-4">
                        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: 'rgba(59,130,246,0.4)', borderTopColor: '#3b82f6' }} />
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Invio in corso…
                        </p>
                    </div>
                )}

                {/* ── FASE: completata ── */}
                {fase === 'completata' && (
                    <div className="flex flex-col items-center py-6 gap-4">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 64, height: 64, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)' }}>
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <div className="text-center">
                            <p className="text-sm font-medium" style={{ color: '#22c55e' }}>
                                Email inviata
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Il link temporaneo è stato inviato a <strong style={{ color: 'var(--color-text-secondary)' }}>{email}</strong>.
                            </p>
                        </div>
                        <button onClick={onClose}
                            className="rounded px-5 py-1.5 text-xs mt-2"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            Chiudi
                        </button>
                    </div>
                )}

                {/* ── FASE: errore ── */}
                {fase === 'errore' && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center py-4 gap-4">
                            <div className="rounded-full flex items-center justify-center"
                                style={{ width: 56, height: 56, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Invio non riuscito</p>
                                {errore && (
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{errore}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-center gap-2">
                            <button onClick={handleRiprova}
                                className="rounded px-4 py-1.5 text-xs"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                Riprova
                            </button>
                            <button onClick={onClose}
                                className="rounded px-4 py-1.5 text-xs"
                                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                Chiudi
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
