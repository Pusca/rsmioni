import { useEffect, useRef, useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import { Chiosco } from '@/types';

// ── Tipi ──────────────────────────────────────────────────────────────────────

interface Presenza {
    online: boolean;
    ultimo_heartbeat: string | null;
    secondi_fa: number | null;
    dati: {
        user_agent?: string;
        fullscreen?: boolean;
        screen_w?: number;
        screen_h?: number;
        url?: string;
        chiosco_nome?: string;
    } | null;
}

interface OperazioniPendenti {
    acquisizione: { tipo: string; titolo?: string; created_at?: string } | null;
    stampa:       { tipo: string; titolo?: string; created_at?: string } | null;
    pagamento:    { tipo: string; importo?: number; created_at?: string } | null;
}

interface Problema {
    tipo:    'runtime' | 'browser' | 'configurazione';
    livello: 'info' | 'warning' | 'errore';
    msg:     string;
    azione:  string;
}

interface Diagnostica {
    presenza: Presenza;
    stato:    string;
    pendenti: OperazioniPendenti;
    problemi: Problema[];
}

interface ChioscoWithHotel extends Omit<Chiosco, 'hotel'> {
    hotel: { id: string; nome: string; chioschi_concorrenti_max: number } | null;
}

interface Props {
    chiosco:    ChioscoWithHotel;
    diagnostica: Diagnostica;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function livelloColor(livello: Problema['livello']): string {
    switch (livello) {
        case 'errore':  return '#ef4444';
        case 'warning': return '#f59e0b';
        default:        return '#60a5fa';
    }
}

function livelloBg(livello: Problema['livello']): string {
    switch (livello) {
        case 'errore':  return 'rgba(239,68,68,0.08)';
        case 'warning': return 'rgba(245,158,11,0.08)';
        default:        return 'rgba(96,165,250,0.08)';
    }
}

function statoColor(stato: string): string {
    switch (stato) {
        case 'offline':         return '#5c6380';
        case 'idle':            return '#22c55e';
        case 'in_chiamata':     return '#ef4444';
        case 'in_chiaro':       return '#22c55e';
        case 'in_nascosto':     return '#eab308';
        case 'in_parlato':      return '#3b82f6';
        case 'messaggio_attesa':return '#9ba3c0';
        default:                return '#5c6380';
    }
}

function SecondiFa({ secondi }: { secondi: number | null }) {
    if (secondi === null) return <span style={{ color: 'var(--color-text-muted)' }}>—</span>;
    const m = Math.floor(secondi / 60);
    const s = secondi % 60;
    if (m === 0) return <span>{s}s fa</span>;
    return <span>{m}m {s}s fa</span>;
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function DiagnosticaPage({ chiosco, diagnostica: iniziale }: Props) {
    const [diag, setDiag] = useState<Diagnostica>(iniziale);
    const [polling, setPolling] = useState(true);
    const [ultimoAggiornamento, setUltimoAggiornamento] = useState<Date>(new Date());
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // ── Polling JSON ──────────────────────────────────────────────────────────
    useEffect(() => {
        if (! polling) return;

        timerRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/configurazioni/chioschi/${chiosco.id}/diagnostica/stato`, {
                    headers: { 'Accept': 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
                });
                if (res.ok) {
                    const data = await res.json() as Diagnostica;
                    setDiag(data);
                    setUltimoAggiornamento(new Date());
                }
            } catch { /* ignora errori transitori */ }
        }, 5_000);

        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [polling, chiosco.id]);

    // ── Recovery actions ──────────────────────────────────────────────────────
    const doAction = (action: string, url: string) => {
        if (actionLoading) return;
        setActionLoading(action);
        router.post(url, {}, {
            onFinish: () => setActionLoading(null),
        });
    };

    const hasPendenti = diag.pendenti.acquisizione || diag.pendenti.stampa || diag.pendenti.pagamento;

    return (
        <GestoreHotelLayout>
            <Head title={`Diagnostica — ${chiosco.nome}`} />

            <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">

                {/* Header */}
                <div>
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        <Link href="/configurazioni/chioschi" style={{ color: 'var(--color-text-muted)' }}>Configurazioni</Link>
                        <span>/</span>
                        <Link href="/configurazioni/chioschi" style={{ color: 'var(--color-text-muted)' }}>Chioschi</Link>
                        <span>/</span>
                        <span>{chiosco.nome}</span>
                        <span>/</span>
                        <span>Diagnostica</span>
                    </div>
                    <div className="flex items-center justify-between">
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Diagnostica Runtime — {chiosco.nome}
                        </h1>
                        <div className="flex items-center gap-3">
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Aggiornato: {ultimoAggiornamento.toLocaleTimeString('it-IT')}
                            </span>
                            <button
                                onClick={() => setPolling(p => !p)}
                                className="px-3 py-1 rounded text-xs"
                                style={{
                                    border:          '1px solid var(--color-border)',
                                    color:           polling ? '#22c55e' : 'var(--color-text-muted)',
                                    backgroundColor: 'transparent',
                                }}>
                                {polling ? '⏸ Pausa polling' : '▶ Avvia polling'}
                            </button>
                        </div>
                    </div>
                    {chiosco.hotel && (
                        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Hotel: {chiosco.hotel.nome}
                        </p>
                    )}
                </div>

                {/* Problemi rilevati */}
                {diag.problemi.length > 0 && (
                    <div className="space-y-2">
                        <h2 className="text-xs font-semibold uppercase tracking-wider mb-2"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Problemi rilevati ({diag.problemi.length})
                        </h2>
                        {diag.problemi.map((p, i) => (
                            <div key={i} className="rounded-lg px-4 py-3 flex items-start gap-3"
                                style={{ backgroundColor: livelloBg(p.livello), border: `1px solid ${livelloColor(p.livello)}33` }}>
                                <span className="mt-0.5 shrink-0 text-xs font-bold uppercase"
                                    style={{ color: livelloColor(p.livello), minWidth: 52 }}>
                                    {p.livello}
                                </span>
                                <div className="flex-1">
                                    <p className="text-sm" style={{ color: 'var(--color-text-primary)' }}>{p.msg}</p>
                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                        Tipo: {p.tipo} — Azione suggerita: {p.azione}
                                    </p>
                                </div>
                                {p.azione === 'reset_pendenti' && (
                                    <RecoveryBtn
                                        label="Reset pendenti"
                                        loading={actionLoading === 'reset_pendenti'}
                                        color="#f59e0b"
                                        onClick={() => doAction('reset_pendenti',
                                            `/configurazioni/chioschi/${chiosco.id}/diagnostica/reset-pendenti`)}
                                    />
                                )}
                                {p.azione === 'forza_offline' && (
                                    <RecoveryBtn
                                        label="Forza offline"
                                        loading={actionLoading === 'forza_offline'}
                                        color="#ef4444"
                                        onClick={() => doAction('forza_offline',
                                            `/configurazioni/chioschi/${chiosco.id}/diagnostica/forza-offline`)}
                                    />
                                )}
                                {p.azione === 'configura' && (
                                    <Link
                                        href={`/configurazioni/chioschi/${chiosco.id}/edit`}
                                        className="shrink-0 px-3 py-1 rounded text-xs"
                                        style={{ border: '1px solid #60a5fa', color: '#60a5fa' }}>
                                        Configura
                                    </Link>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {diag.problemi.length === 0 && (
                    <div className="rounded-lg px-4 py-3 flex items-center gap-3"
                        style={{ backgroundColor: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)' }}>
                        <span style={{ color: '#22c55e' }}>✓</span>
                        <span className="text-sm" style={{ color: '#22c55e' }}>
                            Nessun problema rilevato automaticamente.
                        </span>
                    </div>
                )}

                {/* Grid: Presenza + Stato */}
                <div className="grid grid-cols-2 gap-4">

                    {/* Presenza heartbeat */}
                    <Card title="Presenza Browser (Heartbeat)">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: diag.presenza.online ? '#22c55e' : '#5c6380' }} />
                                <span className="font-medium text-sm"
                                    style={{ color: diag.presenza.online ? '#22c55e' : '#5c6380' }}>
                                    {diag.presenza.online ? 'Browser online' : 'Browser offline / heartbeat assente'}
                                </span>
                            </div>
                            {diag.presenza.online && (
                                <>
                                    <Row label="Ultimo heartbeat">
                                        <SecondiFa secondi={diag.presenza.secondi_fa} />
                                    </Row>
                                    {diag.presenza.dati && (
                                        <>
                                            <Row label="Fullscreen">
                                                {diag.presenza.dati.fullscreen ? (
                                                    <span style={{ color: '#22c55e' }}>Sì</span>
                                                ) : (
                                                    <span style={{ color: '#f59e0b' }}>No</span>
                                                )}
                                            </Row>
                                            <Row label="Risoluzione">
                                                {diag.presenza.dati.screen_w && diag.presenza.dati.screen_h
                                                    ? `${diag.presenza.dati.screen_w} × ${diag.presenza.dati.screen_h}`
                                                    : '—'}
                                            </Row>
                                            <Row label="Pagina">
                                                <span className="font-mono text-xs break-all"
                                                    style={{ color: 'var(--color-text-muted)' }}>
                                                    {diag.presenza.dati.url ?? '—'}
                                                </span>
                                            </Row>
                                            <Row label="User Agent">
                                                <span className="font-mono text-xs break-all"
                                                    style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                                                    {diag.presenza.dati.user_agent ?? '—'}
                                                </span>
                                            </Row>
                                        </>
                                    )}
                                </>
                            )}
                            <RecoveryBtn
                                label="Reset presenza"
                                loading={actionLoading === 'reset_presenza'}
                                color="#5c6380"
                                onClick={() => doAction('reset_presenza',
                                    `/configurazioni/chioschi/${chiosco.id}/diagnostica/reset-presenza`)}
                            />
                        </div>
                    </Card>

                    {/* Stato Portineria */}
                    <Card title="Stato Portineria (Runtime)">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: statoColor(diag.stato) }} />
                                <span className="font-medium text-sm uppercase font-mono"
                                    style={{ color: statoColor(diag.stato) }}>
                                    {diag.stato}
                                </span>
                            </div>
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Lo stato Portineria è gestito via Cache con TTL 5 min.
                                È indipendente dalla presenza heartbeat.
                            </p>
                            <RecoveryBtn
                                label="Forza offline"
                                loading={actionLoading === 'forza_offline'}
                                color="#ef4444"
                                onClick={() => doAction('forza_offline',
                                    `/configurazioni/chioschi/${chiosco.id}/diagnostica/forza-offline`)}
                            />
                        </div>
                    </Card>
                </div>

                {/* Operazioni pendenti */}
                <Card title="Operazioni Pendenti in Cache">
                    {! hasPendenti ? (
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Nessuna operazione pendente.
                        </p>
                    ) : (
                        <div className="space-y-2">
                            {diag.pendenti.acquisizione && (
                                <PendingRow tipo="acquisizione" color="#3b82f6"
                                    label={`Acquisizione — ${diag.pendenti.acquisizione.titolo ?? 'documento'}`} />
                            )}
                            {diag.pendenti.stampa && (
                                <PendingRow tipo="stampa" color="#7c3aed"
                                    label={`Stampa — ${diag.pendenti.stampa.titolo ?? 'documento'}`} />
                            )}
                            {diag.pendenti.pagamento && (
                                <PendingRow tipo="pagamento" color="#10b981"
                                    label={`Pagamento POS — ${diag.pendenti.pagamento.importo != null
                                        ? `€ ${Number(diag.pendenti.pagamento.importo).toFixed(2)}`
                                        : 'importo n.d.'}`} />
                            )}
                            <div className="pt-2">
                                <RecoveryBtn
                                    label="Reset tutte le operazioni pendenti"
                                    loading={actionLoading === 'reset_pendenti'}
                                    color="#f59e0b"
                                    onClick={() => doAction('reset_pendenti',
                                        `/configurazioni/chioschi/${chiosco.id}/diagnostica/reset-pendenti`)}
                                />
                            </div>
                        </div>
                    )}
                </Card>

                {/* Info configurazione */}
                <Card title="Configurazione Chiosco">
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                        <Row label="IP Address">
                            <span className="font-mono text-xs"
                                style={{ color: chiosco.ip_address ? 'var(--color-text-primary)' : '#f59e0b' }}>
                                {chiosco.ip_address ?? 'Non configurato'}
                            </span>
                        </Row>
                        <Row label="Tipo">
                            <span className="font-mono text-xs uppercase">{chiosco.tipo}</span>
                        </Row>
                        <Row label="POS">
                            {chiosco.has_pos
                                ? <span style={{ color: '#10b981' }}>{chiosco.tipo_pos ?? 'Sì'}</span>
                                : <span style={{ color: 'var(--color-text-muted)' }}>No</span>}
                        </Row>
                        <Row label="Stampante">
                            {chiosco.has_stampante
                                ? <span style={{ color: '#7c3aed' }}>Sì</span>
                                : <span style={{ color: 'var(--color-text-muted)' }}>No</span>}
                        </Row>
                        <Row label="Interattivo">
                            {chiosco.interattivo
                                ? <span style={{ color: '#22c55e' }}>Sì</span>
                                : <span style={{ color: 'var(--color-text-muted)' }}>No</span>}
                        </Row>
                        <Row label="Attivo">
                            {chiosco.attivo
                                ? <span style={{ color: '#22c55e' }}>Sì</span>
                                : <span style={{ color: '#ef4444' }}>No</span>}
                        </Row>
                    </div>
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                        <Link
                            href={`/configurazioni/chioschi/${chiosco.id}/edit`}
                            className="text-xs px-3 py-1 rounded"
                            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                            Modifica configurazione
                        </Link>
                    </div>
                </Card>

                {/* Note tecniche */}
                <div className="rounded-lg px-4 py-3"
                    style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid var(--color-border)' }}>
                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', lineHeight: 1.6 }}>
                        <strong>Presenza vs Stato:</strong> il heartbeat (TTL 120s) misura se il browser del chiosco è attivo.
                        Lo stato Portineria (TTL 300s) è la macchina a stati della sessione receptionist.
                        Sono sistemi indipendenti — un chiosco può essere "online" per il heartbeat ma "offline" per la portineria.
                    </p>
                </div>
            </div>
        </GestoreHotelLayout>
    );
}

// ── Componenti di supporto ────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl p-5 space-y-3"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
                {title}
            </h3>
            {children}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-3 text-sm">
            <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>{label}</span>
            <span style={{ color: 'var(--color-text-primary)', textAlign: 'right' }}>{children}</span>
        </div>
    );
}

function PendingRow({ tipo, color, label }: { tipo: string; color: string; label: string }) {
    return (
        <div className="flex items-center gap-2 py-1.5 px-3 rounded text-sm"
            style={{ backgroundColor: `${color}12`, border: `1px solid ${color}30` }}>
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <span style={{ color: 'var(--color-text-primary)' }}>{label}</span>
            <span className="ml-auto text-xs uppercase font-mono"
                style={{ color, opacity: 0.7 }}>{tipo}</span>
        </div>
    );
}

function RecoveryBtn({
    label, loading, color, onClick,
}: {
    label: string;
    loading: boolean;
    color: string;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="px-3 py-1 rounded text-xs transition-all"
            style={{
                border:          `1px solid ${color}50`,
                color:           loading ? `${color}60` : color,
                backgroundColor: 'transparent',
                cursor:          loading ? 'default' : 'pointer',
            }}>
            {loading ? 'Esecuzione…' : label}
        </button>
    );
}
