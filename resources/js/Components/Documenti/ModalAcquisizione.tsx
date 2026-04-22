import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';

interface Props {
    prenotazioneId: string;
    chioschi:        Array<{ id: string; nome: string }>;
    onClose:         () => void;
}

type Fase = 'form' | 'invio' | 'attesa' | 'completata' | 'errore';

const TIPO_DOCUMENTO_OPTIONS = [
    { value: '',                label: '— Tipo documento —' },
    { value: 'carta_identita',  label: 'Documento identità' },
    { value: 'passaporto',      label: 'Passaporto' },
    { value: 'patente',         label: 'Patente' },
    { value: 'foto',            label: 'Fotografia' },
    { value: 'contratto',       label: 'Contratto' },
    { value: 'modulo',          label: 'Modulo' },
    { value: 'allegato',        label: 'Allegato' },
    { value: 'altro',           label: 'Altro' },
];

const LINGUA_OPTIONS = [
    { value: '',   label: '— Lingua —' },
    { value: 'it', label: 'Italiano' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
];

const TIMEOUT_ATTESA_MS = 120_000; // 2 minuti
const POLLING_STATO_MS  = 3_000;

function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export default function ModalAcquisizione({ prenotazioneId, chioschi, onClose }: Props) {
    const [fase,          setFase]          = useState<Fase>('form');
    const [chioscoId,     setChioscoId]     = useState(chioschi[0]?.id ?? '');
    const [titolo,        setTitolo]        = useState('');
    const [tipoDocumento, setTipoDocumento] = useState('');
    const [lingua,        setLingua]        = useState('');
    const [erroreMsg,     setErroreMsg]     = useState<string | null>(null);

    const pollingRef  = useRef<ReturnType<typeof setInterval> | null>(null);
    const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null);
    const mountedRef  = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (pollingRef.current)  clearInterval(pollingRef.current);
            if (timeoutRef.current)  clearTimeout(timeoutRef.current);
        };
    }, []);

    // ── Avvio acquisizione ────────────────────────────────────────────────────

    const handleInvia = async () => {
        if (! chioscoId) return;
        setFase('invio');
        setErroreMsg(null);

        try {
            const res = await fetch('/acquisizioni', {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Accept':        'application/json',
                    'X-CSRF-TOKEN':  getCsrfToken(),
                },
                body: JSON.stringify({
                    chiosco_id:      chioscoId,
                    prenotazione_id: prenotazioneId,
                    titolo:          titolo || null,
                    lingua:          lingua || null,
                    tipo_documento:  tipoDocumento || null,
                }),
            });

            if (! res.ok) {
                const data = await res.json() as { message?: string };
                throw new Error(data.message ?? 'Errore nella richiesta');
            }

            setFase('attesa');
            avviaPollingStato();
            avviaTimeout();
        } catch (err) {
            setFase('errore');
            setErroreMsg(err instanceof Error ? err.message : 'Errore imprevisto');
        }
    };

    // ── Polling stato completamento ──────────────────────────────────────────

    const avviaPollingStato = () => {
        if (pollingRef.current) return;
        pollingRef.current = setInterval(async () => {
            if (! mountedRef.current) return;
            try {
                const res  = await fetch(`/acquisizioni/${chioscoId}/stato`, {
                    headers: { Accept: 'application/json' },
                });
                if (! res.ok) return;
                const data = await res.json() as { pendente: boolean; completata: boolean };

                if (! mountedRef.current) return;

                if (data.completata) {
                    fermaPolling();
                    setFase('completata');
                    // Ricarica la pagina per mostrare il documento appena acquisito
                    setTimeout(() => {
                        if (mountedRef.current) {
                            router.reload({ only: ['documenti'] });
                            onClose();
                        }
                    }, 1_500);
                }
            } catch { /* best-effort */ }
        }, POLLING_STATO_MS);
    };

    const avviaTimeout = () => {
        timeoutRef.current = setTimeout(() => {
            if (! mountedRef.current || fase === 'completata') return;
            fermaPolling();
            // Annulla la richiesta pendente lato server
            fetch(`/acquisizioni/${chioscoId}`, {
                method:  'DELETE',
                headers: { 'X-CSRF-TOKEN': getCsrfToken(), Accept: 'application/json' },
            }).catch(() => {});
            setFase('errore');
            setErroreMsg('Tempo scaduto. Il chiosco non ha completato l\'acquisizione.');
        }, TIMEOUT_ATTESA_MS);
    };

    const fermaPolling = () => {
        if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
        if (timeoutRef.current) { clearTimeout(timeoutRef.current);  timeoutRef.current = null; }
    };

    // ── Annulla da receptionist ───────────────────────────────────────────────

    const handleAnnulla = async () => {
        fermaPolling();
        if (fase === 'attesa') {
            try {
                await fetch(`/acquisizioni/${chioscoId}`, {
                    method:  'DELETE',
                    headers: { 'X-CSRF-TOKEN': getCsrfToken(), Accept: 'application/json' },
                });
            } catch { /* best-effort */ }
        }
        onClose();
    };

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
                {/* Titolo */}
                <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Acquisisci documento da chiosco
                    </h2>
                    {fase !== 'attesa' && (
                        <button onClick={onClose}
                            className="text-xs rounded px-2 py-1"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            ✕
                        </button>
                    )}
                </div>

                {/* ── FASE: form ── */}
                {fase === 'form' && (
                    <div className="space-y-3">
                        {/* Selezione chiosco */}
                        <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                Chiosco *
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
                                {chioschi.map(c => (
                                    <option key={c.id} value={c.id}>{c.nome}</option>
                                ))}
                            </select>
                        </div>

                        {/* Titolo documento */}
                        <div>
                            <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                Titolo (opzionale)
                            </label>
                            <input
                                type="text"
                                value={titolo}
                                onChange={e => setTitolo(e.target.value)}
                                placeholder="Es. Documento identità ospite"
                                className="w-full rounded px-3 py-2 text-xs outline-none"
                                style={{
                                    backgroundColor: 'var(--color-bg-primary)',
                                    border: '1px solid var(--color-border)',
                                    color: 'var(--color-text-primary)',
                                }}
                            />
                        </div>

                        {/* Tipo documento + Lingua */}
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    Tipo documento
                                </label>
                                <select
                                    value={tipoDocumento}
                                    onChange={e => setTipoDocumento(e.target.value)}
                                    className="w-full rounded px-2 py-2 text-xs outline-none"
                                    style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border)',
                                        color: tipoDocumento ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                    }}>
                                    {TIPO_DOCUMENTO_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ width: '120px' }}>
                                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    Lingua
                                </label>
                                <select
                                    value={lingua}
                                    onChange={e => setLingua(e.target.value)}
                                    className="w-full rounded px-2 py-2 text-xs outline-none"
                                    style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border: '1px solid var(--color-border)',
                                        color: lingua ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                    }}>
                                    {LINGUA_OPTIONS.map(o => (
                                        <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Note operative */}
                        <p className="text-xs rounded px-3 py-2"
                            style={{ color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                            Il chiosco selezionato mostrerà la schermata di acquisizione. Il guest inquadrerà il documento con la webcam e catturerà l'immagine.
                        </p>

                        {/* Azioni */}
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
                                    backgroundColor: chioscoId ? 'var(--color-parlato)' : 'rgba(59,130,246,0.2)',
                                    color: '#fff',
                                    opacity: chioscoId ? 1 : 0.5,
                                    cursor: chioscoId ? 'pointer' : 'not-allowed',
                                }}>
                                Invia richiesta al chiosco
                            </button>
                        </div>
                    </div>
                )}

                {/* ── FASE: invio ── */}
                {fase === 'invio' && (
                    <div className="flex flex-col items-center py-6 gap-4">
                        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
                            style={{ borderColor: 'rgba(59,130,246,0.4)', borderTopColor: '#3b82f6' }} />
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Invio richiesta al chiosco…
                        </p>
                    </div>
                )}

                {/* ── FASE: attesa ── */}
                {fase === 'attesa' && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center py-4 gap-4">
                            {/* Indicatore pulsante */}
                            <div className="relative flex items-center justify-center" style={{ width: 72, height: 72 }}>
                                <div className="absolute inset-0 rounded-full animate-pulse"
                                    style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '2px solid rgba(59,130,246,0.3)' }} />
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                                    <rect x="2" y="3" width="20" height="14" rx="2"/>
                                    <path d="M8 21h8M12 17v4"/>
                                    <circle cx="8" cy="10" r="2"/>
                                    <path d="M14 10l3-2v4l-3-2z"/>
                                </svg>
                            </div>

                            <div className="text-center">
                                <p className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                    Richiesta inviata al chiosco
                                </p>
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    In attesa che il guest acquisisca il documento…
                                </p>
                                {chioschi.find(c => c.id === chioscoId) && (
                                    <p className="text-xs mt-2 rounded px-2 py-1 inline-block"
                                        style={{ color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                        {chioschi.find(c => c.id === chioscoId)?.nome}
                                    </p>
                                )}
                            </div>
                        </div>

                        <p className="text-xs text-center" style={{ color: 'var(--color-text-muted)' }}>
                            La schermata si chiuderà automaticamente al completamento.
                            Timeout: 2 minuti.
                        </p>

                        <div className="flex justify-center">
                            <button
                                onClick={handleAnnulla}
                                className="rounded px-4 py-1.5 text-xs"
                                style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                Annulla acquisizione
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
                            <p className="text-sm font-medium" style={{ color: '#22c55e' }}>
                                Documento acquisito
                            </p>
                            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Il documento è stato salvato nella prenotazione.
                            </p>
                        </div>
                    </div>
                )}

                {/* ── FASE: errore ── */}
                {fase === 'errore' && (
                    <div className="space-y-4">
                        <div className="flex flex-col items-center py-4 gap-4">
                            <div className="rounded-full flex items-center justify-center"
                                style={{ width: 64, height: 64, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                    <circle cx="12" cy="12" r="10"/>
                                    <line x1="12" y1="8" x2="12" y2="12"/>
                                    <line x1="12" y1="16" x2="12.01" y2="16"/>
                                </svg>
                            </div>
                            <div className="text-center">
                                <p className="text-sm font-medium" style={{ color: '#ef4444' }}>Acquisizione non riuscita</p>
                                {erroreMsg && (
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                        {erroreMsg}
                                    </p>
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
