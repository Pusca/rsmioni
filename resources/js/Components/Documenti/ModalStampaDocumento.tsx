import { useEffect, useRef, useState } from 'react';

interface ChioscoItem {
    id:             string;
    nome:           string;
    has_stampante?: boolean;
}

interface Props {
    documentoId:     string;
    titoloDocumento: string | null;
    /** Solo chioschi con has_stampante=true (o tutti, filtro applicato qui) */
    chioschi:        ChioscoItem[];
    onClose:         () => void;
}

type Fase = 'form' | 'invio' | 'attesa' | 'completata' | 'errore';

function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

const TIMEOUT_ATTESA_MS = 120_000; // 2 minuti
const POLLING_STATO_MS  = 3_000;

export default function ModalStampaDocumento({ documentoId, titoloDocumento, chioschi, onClose }: Props) {
    // Filtra solo chioschi con stampante (fallback: mostra tutti se has_stampante non è nel payload)
    const chioschiConStampante = chioschi.filter(c => c.has_stampante !== false);

    const [fase,      setFase]      = useState<Fase>('form');
    const [chioscoId, setChioscoId] = useState(chioschiConStampante[0]?.id ?? '');
    const [erroreMsg, setErroreMsg] = useState<string | null>(null);
    const [esitoMsg,  setEsitoMsg]  = useState<string | null>(null);

    const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
    const mountedRef  = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (pollingRef.current) clearInterval(pollingRef.current);
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, []);

    // ── Avvio stampa ─────────────────────────────────────────────────────────

    const handleInvia = async () => {
        if (! chioscoId) return;
        setFase('invio');
        setErroreMsg(null);

        try {
            const res = await fetch('/stampe', {
                method:  'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept':       'application/json',
                    'X-CSRF-TOKEN': getCsrfToken(),
                },
                body: JSON.stringify({
                    chiosco_id:   chioscoId,
                    documento_id: documentoId,
                }),
            });

            const data = await res.json() as { ok?: boolean; errore?: string; message?: string };
            if (! res.ok) throw new Error(data.errore ?? data.message ?? 'Errore nell\'invio della richiesta');

            setFase('attesa');
            avviaPollingStato();
            avviaTimeout();
        } catch (err) {
            setFase('errore');
            setErroreMsg(err instanceof Error ? err.message : 'Errore imprevisto');
        }
    };

    // ── Polling stato completamento ───────────────────────────────────────────

    const avviaPollingStato = () => {
        if (pollingRef.current) return;
        pollingRef.current = setInterval(async () => {
            if (! mountedRef.current) return;
            try {
                const res  = await fetch(`/stampe/${chioscoId}/stato`, {
                    headers: { Accept: 'application/json' },
                });
                if (! res.ok) return;
                const data = await res.json() as {
                    pendente:   boolean;
                    completata: boolean;
                    esito:      'ok' | 'errore' | null;
                    dettaglio:  string | null;
                };

                if (! mountedRef.current) return;

                if (data.completata) {
                    fermaPolling();
                    if (data.esito === 'ok') {
                        setFase('completata');
                    } else {
                        setFase('errore');
                        setErroreMsg(data.dettaglio ?? 'La stampante ha segnalato un errore.');
                    }
                }
            } catch { /* best-effort */ }
        }, POLLING_STATO_MS);
    };

    const avviaTimeout = () => {
        timeoutRef.current = setTimeout(() => {
            if (! mountedRef.current) return;
            fermaPolling();
            // Annulla la richiesta pendente lato server
            fetch(`/stampe/${chioscoId}`, {
                method:  'DELETE',
                headers: { 'X-CSRF-TOKEN': getCsrfToken(), Accept: 'application/json' },
            }).catch(() => {});
            setFase('errore');
            setErroreMsg('Timeout: il chiosco non ha completato la stampa in 2 minuti.');
        }, TIMEOUT_ATTESA_MS);
    };

    const fermaPolling = () => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (timeoutRef.current) { clearTimeout(timeoutRef.current);  timeoutRef.current = null; }
    };

    const handleAnnulla = async () => {
        fermaPolling();
        if (fase === 'attesa') {
            try {
                await fetch(`/stampe/${chioscoId}`, {
                    method:  'DELETE',
                    headers: { 'X-CSRF-TOKEN': getCsrfToken(), Accept: 'application/json' },
                });
            } catch { /* best-effort */ }
        }
        onClose();
    };

    const nomeChiosco = chioschi.find(c => c.id === chioscoId)?.nome;

    // ── Rendering ─────────────────────────────────────────────────────────────

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
            onClick={e => { if (e.target === e.currentTarget && fase !== 'attesa') onClose(); }}
        >
            <div
                className="w-full max-w-md rounded-xl p-6 shadow-2xl"
                style={{ backgroundColor: '#0d1020', border: '1px solid #1a1d27' }}
            >
                {/* Intestazione */}
                <div className="flex items-center justify-between mb-5">
                    <div>
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Stampa remota
                        </h2>
                        {titoloDocumento && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                {titoloDocumento}
                            </p>
                        )}
                    </div>
                    {fase !== 'attesa' && (
                        <button onClick={onClose}
                            className="text-xs rounded px-2 py-1"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            ✕
                        </button>
                    )}
                </div>

                {/* Nessun chiosco con stampante */}
                {chioschiConStampante.length === 0 && (
                    <div className="py-6 text-center space-y-2">
                        <p className="text-sm" style={{ color: '#f59e0b' }}>
                            Nessun chiosco con stampante disponibile.
                        </p>
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Verificare che almeno un chiosco abbia una stampante configurata e sia attivo.
                        </p>
                        <button onClick={onClose} className="mt-2 text-xs rounded px-4 py-1.5"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            Chiudi
                        </button>
                    </div>
                )}

                {/* ── FASE: form ── */}
                {chioschiConStampante.length > 0 && fase === 'form' && (
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs mb-1 font-medium"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Chiosco destinatario *
                            </label>
                            <select
                                value={chioscoId}
                                onChange={e => setChioscoId(e.target.value)}
                                className="w-full rounded px-3 py-2 text-xs outline-none"
                                style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                }}>
                                {chioschiConStampante.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </select>
                        </div>

                        <p className="text-xs rounded px-3 py-2"
                            style={{ color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            Il documento verrà inviato alla stampante del chiosco selezionato.
                            Il dialog di stampa apparirà direttamente sul chiosco.
                        </p>

                        <div className="flex items-center justify-end gap-2 pt-1">
                            <button onClick={onClose}
                                className="rounded px-4 py-1.5 text-xs"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                Annulla
                            </button>
                            <button
                                onClick={handleInvia}
                                disabled={! chioscoId}
                                className="rounded px-4 py-1.5 text-xs font-medium"
                                style={{
                                    backgroundColor: chioscoId ? '#7c3aed' : 'rgba(124,58,237,0.2)',
                                    color: '#fff',
                                    opacity: chioscoId ? 1 : 0.5,
                                    cursor: chioscoId ? 'pointer' : 'not-allowed',
                                }}>
                                Invia alla stampante
                            </button>
                        </div>
                    </div>
                )}

                {/* ── FASE: invio ── */}
                {fase === 'invio' && (
                    <div className="flex flex-col items-center py-8 gap-4">
                        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: 'rgba(124,58,237,0.4)', borderTopColor: '#7c3aed' }} />
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Invio richiesta al chiosco…
                        </p>
                    </div>
                )}

                {/* ── FASE: attesa ── */}
                {fase === 'attesa' && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center py-4 gap-4">
                            <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
                                <div className="absolute inset-0 rounded-full animate-pulse"
                                    style={{ backgroundColor: 'rgba(124,58,237,0.08)', border: '2px solid rgba(124,58,237,0.3)' }} />
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
                                    <polyline points="6 9 6 2 18 2 18 9"/>
                                    <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                                    <rect x="6" y="14" width="12" height="8"/>
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                    Stampa in corso
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    In attesa della conferma dal chiosco…
                                </p>
                                {nomeChiosco && (
                                    <p className="text-xs mt-2 rounded px-2 py-1 inline-block"
                                        style={{ color: '#7c3aed', backgroundColor: 'rgba(124,58,237,0.08)', border: '1px solid rgba(124,58,237,0.2)' }}>
                                        {nomeChiosco}
                                    </p>
                                )}
                            </div>
                        </div>
                        <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                            Timeout: 2 minuti.
                        </p>
                        <div className="flex justify-center">
                            <button onClick={handleAnnulla}
                                className="rounded px-4 py-1.5 text-xs"
                                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                Annulla stampa
                            </button>
                        </div>
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
                            <p className="text-sm font-medium" style={{ color: '#22c55e' }}>Stampa completata</p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Il documento è stato inviato alla stampante del chiosco.
                            </p>
                        </div>
                        <button onClick={onClose}
                            className="rounded px-5 py-1.5 text-xs mt-1"
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
                                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Stampa non riuscita</p>
                                {erroreMsg && (
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{erroreMsg}</p>
                                )}
                            </div>
                        </div>
                        <div className="flex justify-center gap-2">
                            <button onClick={() => { setFase('form'); setErroreMsg(null); }}
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
