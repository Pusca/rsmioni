import { useEffect, useRef, useState } from 'react';

interface ChioscoPOS {
    id:       string;
    nome:     string;
    has_pos:  boolean;
    tipo_pos: string | null;
    stato:    string; // sempre 'in_parlato' quando passato a questo modal
}

interface Props {
    prenotazioneId: string;
    chioschi:       ChioscoPOS[];
    onClose:        () => void;
}

type Fase = 'form' | 'invio' | 'attesa' | 'ok' | 'ko' | 'annullato' | 'errore';

interface PagamentoAttivo {
    pagamento_id: string;
    chiosco_id:   string;
    importo:      number;
    causale:      string | null;
}

/**
 * Modal per avviare un pagamento POS remoto su un chiosco.
 *
 * Flusso:
 *   form → POST /pagamenti (crea record) → attesa (polling) → ok/ko/annullato
 *
 * Polling: GET /pagamenti/{chiosco}/stato?pagamento_id=X ogni 3s.
 * Il kiosk segnala l'esito via POST /kiosk/pagamenti/esito.
 */
export default function ModalPagamentoPOS({ prenotazioneId, chioschi, onClose }: Props) {
    const chioschiConPos = chioschi.filter(c => c.has_pos);

    const [fase,    setFase]    = useState<Fase>('form');
    const [errore,  setErrore]  = useState<string | null>(null);
    const [attivo,  setAttivo]  = useState<PagamentoAttivo | null>(null);

    // Form fields
    const [importo,    setImporto]    = useState('');
    const [causale,    setCausale]    = useState('');
    const [chioscoId,  setChioscoId]  = useState(chioschiConPos[0]?.id ?? '');

    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Avvia polling quando si entra in 'attesa'
    useEffect(() => {
        if (fase !== 'attesa' || ! attivo) return;

        const poll = async () => {
            try {
                const res = await fetch(
                    `/pagamenti/${attivo.chiosco_id}/stato?pagamento_id=${attivo.pagamento_id}`,
                    { headers: { Accept: 'application/json' } }
                );
                if (! res.ok) return;
                const data = await res.json() as { esito: string };
                if (data.esito === 'pending') return; // ancora in attesa

                pollingRef.current && clearInterval(pollingRef.current);
                pollingRef.current = null;

                if (data.esito === 'ok')        setFase('ok');
                else if (data.esito === 'ko')   setFase('ko');
                else                            setFase('annullato');
            } catch { /* ignora errori di rete transitori */ }
        };

        poll(); // prima lettura immediata
        pollingRef.current = setInterval(poll, 3_000);

        return () => {
            pollingRef.current && clearInterval(pollingRef.current);
            pollingRef.current = null;
        };
    }, [fase, attivo]);

    // ── Invio richiesta ───────────────────────────────────────────────────────

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        const imp = parseFloat(importo.replace(',', '.'));
        if (isNaN(imp) || imp <= 0) {
            setErrore("L'importo deve essere un numero positivo.");
            return;
        }
        if (! chioscoId) {
            setErrore('Seleziona un chiosco con POS.');
            return;
        }

        setFase('invio');
        setErrore(null);

        try {
            const csrfMeta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
            const csrf     = csrfMeta?.content ?? '';

            const res = await fetch('/pagamenti', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Accept':        'application/json',
                    'X-CSRF-TOKEN':  csrf,
                },
                body: JSON.stringify({
                    chiosco_id:      chioscoId,
                    prenotazione_id: prenotazioneId,
                    importo:         imp,
                    valuta:          'EUR',
                    causale:         causale.trim() || null,
                }),
            });

            const data = await res.json() as { ok?: boolean; errore?: string; pagamento_id?: string; chiosco_id?: string };

            if (! res.ok || ! data.ok) {
                setFase('errore');
                setErrore(data.errore ?? 'Errore durante la creazione del pagamento.');
                return;
            }

            setAttivo({
                pagamento_id: data.pagamento_id!,
                chiosco_id:   data.chiosco_id!,
                importo:      imp,
                causale:      causale.trim() || null,
            });
            setFase('attesa');
        } catch {
            setFase('errore');
            setErrore('Errore di rete. Riprovare.');
        }
    };

    // ── Annulla richiesta pendente ─────────────────────────────────────────────

    const handleAnnulla = async () => {
        if (! attivo) { onClose(); return; }

        try {
            const csrfMeta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
            await fetch(`/pagamenti/${attivo.chiosco_id}`, {
                method:  'DELETE',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept':       'application/json',
                    'X-CSRF-TOKEN': csrfMeta?.content ?? '',
                },
                body: JSON.stringify({ pagamento_id: attivo.pagamento_id }),
            });
        } catch { /* best-effort */ }

        setFase('annullato');
    };

    // ── Chiusura con reload prenotazione ──────────────────────────────────────

    const handleClose = () => {
        // Se il pagamento è completato (qualsiasi esito), ricarica la pagina
        // per aggiornare lo storico dei pagamenti.
        if (['ok', 'ko', 'annullato'].includes(fase)) {
            window.location.reload();
        } else {
            onClose();
        }
    };

    // ── UI ────────────────────────────────────────────────────────────────────

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}>

            <div className="rounded-xl w-full max-w-md shadow-2xl"
                style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4"
                    style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg flex items-center justify-center"
                            style={{ width: 36, height: 36, backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)' }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.8">
                                <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                                <line x1="1" y1="10" x2="23" y2="10"/>
                            </svg>
                        </div>
                        <div>
                            <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                Pagamento POS remoto
                            </h2>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Invia richiesta di pagamento al chiosco
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose}
                        className="rounded-lg p-1.5 transition-colors"
                        style={{ color: 'var(--color-text-muted)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text-primary)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                {/* Corpo */}
                <div className="px-6 py-5">

                    {/* ── FORM ── */}
                    {(fase === 'form' || fase === 'invio') && (
                        <form onSubmit={handleSubmit} className="space-y-4">
                            {errore && (
                                <div className="rounded-lg px-3 py-2 text-sm"
                                    style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                                    {errore}
                                </div>
                            )}

                            {/* Chiosco */}
                            {chioschiConPos.length > 1 && (
                                <div>
                                    <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                        Chiosco con POS
                                    </label>
                                    <select
                                        value={chioscoId}
                                        onChange={e => setChioscoId(e.target.value)}
                                        disabled={fase === 'invio'}
                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                                        {chioschiConPos.map(c => (
                                            <option key={c.id} value={c.id}>
                                                {c.nome} — {c.tipo_pos ?? 'POS'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {chioschiConPos.length === 1 && (
                                <div className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2">
                                        <rect x="1" y="4" width="22" height="16" rx="2"/>
                                        <line x1="1" y1="10" x2="23" y2="10"/>
                                    </svg>
                                    <span style={{ color: 'var(--color-text-secondary)' }}>
                                        {chioschiConPos[0].nome}
                                    </span>
                                    <span className="ml-auto text-xs font-mono uppercase"
                                        style={{ color: 'var(--color-text-muted)' }}>
                                        {chioschiConPos[0].tipo_pos ?? 'POS'}
                                    </span>
                                </div>
                            )}

                            {/* Importo */}
                            <div>
                                <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                    Importo (€) <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm"
                                        style={{ color: 'var(--color-text-muted)' }}>€</span>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={importo}
                                        onChange={e => setImporto(e.target.value)}
                                        placeholder="0.00"
                                        disabled={fase === 'invio'}
                                        required
                                        className="w-full rounded-lg pl-8 pr-3 py-2 text-sm"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                                    />
                                </div>
                            </div>

                            {/* Causale */}
                            <div>
                                <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                    Causale <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>(opzionale)</span>
                                </label>
                                <input
                                    type="text"
                                    value={causale}
                                    onChange={e => setCausale(e.target.value)}
                                    placeholder="es. Saldo soggiorno, Minibar, Extra…"
                                    maxLength={255}
                                    disabled={fase === 'invio'}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                                />
                            </div>

                            {/* Azioni */}
                            <div className="flex items-center justify-end gap-3 pt-1">
                                <button type="button" onClick={onClose}
                                    disabled={fase === 'invio'}
                                    className="px-4 py-2 rounded-lg text-sm"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                    Annulla
                                </button>
                                <button type="submit"
                                    disabled={fase === 'invio' || ! chioscoId}
                                    className="px-5 py-2 rounded-lg text-sm font-medium transition-all"
                                    style={{
                                        backgroundColor: fase === 'invio' ? 'rgba(16,185,129,0.4)' : '#10b981',
                                        color: '#fff',
                                        border: 'none',
                                        cursor: fase === 'invio' ? 'default' : 'pointer',
                                    }}>
                                    {fase === 'invio' ? (
                                        <span className="flex items-center gap-2">
                                            <span className="w-3.5 h-3.5 rounded-full border-2 border-t-transparent animate-spin"
                                                style={{ borderColor: 'rgba(255,255,255,0.4)', borderTopColor: '#fff' }} />
                                            Invio…
                                        </span>
                                    ) : 'Avvia pagamento'}
                                </button>
                            </div>
                        </form>
                    )}

                    {/* ── IN ATTESA ── */}
                    {fase === 'attesa' && attivo && (
                        <div className="space-y-5">
                            {/* Riepilogo */}
                            <div className="rounded-lg px-4 py-3"
                                style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <div className="flex items-center justify-between">
                                    <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Importo richiesto</span>
                                    <span className="text-lg font-semibold" style={{ color: '#10b981' }}>
                                        € {attivo.importo.toFixed(2)}
                                    </span>
                                </div>
                                {attivo.causale && (
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                        {attivo.causale}
                                    </p>
                                )}
                            </div>

                            {/* Stato attesa */}
                            <div className="flex flex-col items-center gap-4 py-4">
                                <div className="relative flex items-center justify-center" style={{ width: 64, height: 64 }}>
                                    <div className="absolute inset-0 rounded-full animate-pulse"
                                        style={{ backgroundColor: 'rgba(16,185,129,0.1)', border: '2px solid rgba(16,185,129,0.3)' }} />
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.5">
                                        <rect x="1" y="4" width="22" height="16" rx="2"/>
                                        <line x1="1" y1="10" x2="23" y2="10"/>
                                    </svg>
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                        Richiesta inviata al chiosco
                                    </p>
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                        In attesa che il guest completi il pagamento al POS…
                                    </p>
                                </div>
                            </div>

                            {/* Annulla */}
                            <div className="flex justify-center">
                                <button onClick={handleAnnulla}
                                    className="px-4 py-2 rounded-lg text-sm transition-colors"
                                    style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)' }}>
                                    Annulla richiesta
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── OK ── */}
                    {fase === 'ok' && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="rounded-full flex items-center justify-center"
                                style={{ width: 72, height: 72, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.35)' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                    <polyline points="20 6 9 17 4 12"/>
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-base font-medium" style={{ color: '#22c55e' }}>Pagamento riuscito</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    La transazione è stata completata correttamente.
                                </p>
                            </div>
                            <button onClick={handleClose}
                                className="mt-2 px-5 py-2 rounded-lg text-sm font-medium"
                                style={{ backgroundColor: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                                Chiudi
                            </button>
                        </div>
                    )}

                    {/* ── KO ── */}
                    {fase === 'ko' && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="rounded-full flex items-center justify-center"
                                style={{ width: 72, height: 72, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-base font-medium" style={{ color: '#ef4444' }}>Pagamento non riuscito</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    La transazione è stata rifiutata dal POS.
                                </p>
                            </div>
                            <button onClick={handleClose}
                                className="mt-2 px-5 py-2 rounded-lg text-sm font-medium"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                Chiudi
                            </button>
                        </div>
                    )}

                    {/* ── ANNULLATO ── */}
                    {fase === 'annullato' && (
                        <div className="flex flex-col items-center gap-4 py-4">
                            <div className="rounded-full flex items-center justify-center"
                                style={{ width: 72, height: 72, backgroundColor: 'rgba(100,116,139,0.08)', border: '2px solid rgba(100,116,139,0.25)' }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="15" y1="9" x2="9" y2="15"/>
                                    <line x1="9" y1="9" x2="15" y2="15"/>
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-base font-medium" style={{ color: '#64748b' }}>Pagamento annullato</p>
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    La richiesta è stata annullata.
                                </p>
                            </div>
                            <button onClick={handleClose}
                                className="mt-2 px-5 py-2 rounded-lg text-sm font-medium"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                Chiudi
                            </button>
                        </div>
                    )}

                    {/* ── ERRORE ── */}
                    {fase === 'errore' && (
                        <div className="space-y-4">
                            <div className="rounded-lg px-3 py-2 text-sm"
                                style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                                {errore ?? 'Si è verificato un errore imprevisto.'}
                            </div>
                            <div className="flex justify-end gap-3">
                                <button onClick={onClose}
                                    className="px-4 py-2 rounded-lg text-sm"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                                    Chiudi
                                </button>
                                <button onClick={() => { setFase('form'); setErrore(null); }}
                                    className="px-4 py-2 rounded-lg text-sm font-medium"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                                    Riprova
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
