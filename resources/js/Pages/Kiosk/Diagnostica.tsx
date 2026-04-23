import { Head, Link } from '@inertiajs/react';
import KioskLayout from '@/Layouts/KioskLayout';
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
    } | null;
}

interface OperazioniPendenti {
    acquisizione: { tipo: string } | null;
    stampa:       { tipo: string } | null;
    pagamento:    { tipo: string; importo?: number } | null;
}

interface ChioscoWithHotel extends Omit<Chiosco, 'hotel'> {
    hotel: { id: string; nome: string } | null;
}

interface Props {
    chiosco:  ChioscoWithHotel;
    presenza: Presenza;
    pendenti: OperazioniPendenti;
    stato:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function BoolRow({ label, value, goodWhenTrue = true }: {
    label: string;
    value: boolean | null | undefined;
    goodWhenTrue?: boolean;
}) {
    if (value === null || value === undefined) {
        return <InfoRow label={label} value="—" />;
    }
    const isGood = goodWhenTrue ? value : !value;
    return (
        <div className="flex items-center justify-between py-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span className="text-sm font-medium" style={{ color: isGood ? '#22c55e' : '#f59e0b' }}>
                {value ? 'Sì' : 'No'}
            </span>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string | number | null | undefined }) {
    return (
        <div className="flex items-start justify-between gap-4 py-2"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="text-sm shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span className="text-sm text-right break-all font-mono"
                style={{ color: 'var(--color-text-primary)', fontSize: '12px' }}>
                {value ?? '—'}
            </span>
        </div>
    );
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function KioskDiagnostica({ chiosco, presenza, pendenti, stato }: Props) {
    const hasPendenti = pendenti.acquisizione || pendenti.stampa || pendenti.pagamento;
    const secondiFa   = presenza.secondi_fa;

    return (
        <KioskLayout>
            <Head title="Auto-Diagnostica Chiosco" />

            <div className="w-full h-full overflow-y-auto" style={{ backgroundColor: '#050710' }}>
                <div className="max-w-2xl mx-auto py-8 px-6 space-y-6">

                    {/* Header */}
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                Auto-Diagnostica
                            </h1>
                            <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                {chiosco.nome} · {chiosco.hotel?.nome ?? '—'}
                            </p>
                        </div>
                        <Link
                            href="/kiosk"
                            className="px-3 py-1.5 rounded text-xs"
                            style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                            ← Torna al chiosco
                        </Link>
                    </div>

                    {/* Stato generale */}
                    <div className="rounded-xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Stato Sessione
                        </h2>

                        <div className="grid grid-cols-3 gap-4 mb-4">
                            {/* Presenza */}
                            <StatBox
                                label="Heartbeat"
                                value={presenza.online ? 'Online' : 'Assente'}
                                color={presenza.online ? '#22c55e' : '#5c6380'}
                                sub={presenza.online && secondiFa !== null
                                    ? `${secondiFa}s fa`
                                    : 'nessun heartbeat'}
                            />
                            {/* Stato portineria */}
                            <StatBox
                                label="Stato Portineria"
                                value={stato}
                                color={stato === 'offline' ? '#5c6380'
                                     : stato === 'idle' ? '#22c55e'
                                     : stato === 'in_chiamata' ? '#ef4444'
                                     : stato === 'in_nascosto' ? '#eab308'
                                     : '#3b82f6'}
                                sub={stato === 'offline' ? 'cache scaduta o mai impostata' : 'aggiornato via cache'}
                            />
                            {/* Pendenti */}
                            <StatBox
                                label="Operazioni pendenti"
                                value={hasPendenti ? 'Presenti' : 'Nessuna'}
                                color={hasPendenti ? '#f59e0b' : '#22c55e'}
                                sub={hasPendenti
                                    ? [
                                        pendenti.acquisizione && 'acquisizione',
                                        pendenti.stampa       && 'stampa',
                                        pendenti.pagamento    && 'pagamento',
                                      ].filter(Boolean).join(', ')
                                    : 'cache pulita'}
                            />
                        </div>
                    </div>

                    {/* Info browser */}
                    <div className="rounded-xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Informazioni Browser
                        </h2>
                        <BoolRow label="Fullscreen attivo"
                            value={presenza.dati?.fullscreen}
                            goodWhenTrue />
                        <InfoRow label="Risoluzione schermo"
                            value={presenza.dati?.screen_w && presenza.dati?.screen_h
                                ? `${presenza.dati.screen_w} × ${presenza.dati.screen_h} px`
                                : null} />
                        <InfoRow label="Pagina corrente"
                            value={presenza.dati?.url} />
                        <InfoRow label="User Agent"
                            value={presenza.dati?.user_agent} />
                        <InfoRow label="Ultimo heartbeat inviato"
                            value={presenza.ultimo_heartbeat
                                ? new Date(presenza.ultimo_heartbeat).toLocaleString('it-IT')
                                : null} />
                    </div>

                    {/* Configurazione hardware */}
                    <div className="rounded-xl p-5"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <h2 className="text-xs font-semibold uppercase tracking-wider mb-4"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Hardware Configurato
                        </h2>
                        <BoolRow label="POS abilitato"     value={chiosco.has_pos}       goodWhenTrue={false} />
                        <BoolRow label="Stampante abilitata" value={chiosco.has_stampante} goodWhenTrue={false} />
                        <BoolRow label="Interattivo (touch)" value={chiosco.interattivo} />
                        <InfoRow label="IP Address"         value={chiosco.ip_address} />
                        <InfoRow label="Tipo POS"           value={chiosco.tipo_pos} />
                    </div>

                    {/* Operazioni pendenti dettaglio */}
                    {hasPendenti && (
                        <div className="rounded-xl p-5"
                            style={{ backgroundColor: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3"
                                style={{ color: '#f59e0b' }}>
                                Operazioni in Cache
                            </h2>
                            <div className="space-y-2 text-sm">
                                {pendenti.acquisizione && (
                                    <div style={{ color: '#60a5fa' }}>• Acquisizione documento in attesa</div>
                                )}
                                {pendenti.stampa && (
                                    <div style={{ color: '#a78bfa' }}>• Stampa remota in attesa</div>
                                )}
                                {pendenti.pagamento && (
                                    <div style={{ color: '#10b981' }}>
                                        • Pagamento POS pending
                                        {pendenti.pagamento.importo !== undefined && (
                                            <span> — € {Number(pendenti.pagamento.importo).toFixed(2)}</span>
                                        )}
                                    </div>
                                )}
                                <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                                    Per annullare le operazioni pendenti, contattare il Gestore Hotel.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Link collaudo */}
                    <div className="flex items-center justify-center pt-2">
                        <Link
                            href="/kiosk/collaudo"
                            className="px-6 py-2.5 rounded-lg text-sm font-medium"
                            style={{
                                border:          '1px solid rgba(34,197,94,0.3)',
                                color:           '#22c55e',
                                backgroundColor: 'rgba(34,197,94,0.06)',
                            }}>
                            Esegui collaudo completo →
                        </Link>
                    </div>

                    {/* Footer */}
                    <p className="text-center text-xs pb-4" style={{ color: '#3a3f55' }}>
                        {chiosco.nome} · auto-diagnostica · heartbeat TTL 120s · stato TTL 300s
                    </p>
                </div>
            </div>
        </KioskLayout>
    );
}

// ── Stat box ──────────────────────────────────────────────────────────────────

function StatBox({
    label, value, color, sub,
}: {
    label: string;
    value: string;
    color: string;
    sub: string;
}) {
    return (
        <div className="rounded-lg p-3 text-center"
            style={{ backgroundColor: `${color}10`, border: `1px solid ${color}30` }}>
            <p className="text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            <p className="text-sm font-semibold font-mono uppercase" style={{ color }}>{value}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>{sub}</p>
        </div>
    );
}
