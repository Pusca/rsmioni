import { Head } from '@inertiajs/react';
import { ReactNode } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import type {
    AppuntamentoRow, Attore, CampagnaRow, EventoRow, LeadRow, MarketingDashboardProps,
    Piattaforma, RiepilogoPiattaforma, StadioFunnel, StatoAppuntamento, StatoCampagna, StatoLead,
} from '@/types/marketing';

/**
 * Marketing — funnel campagne → lead → appuntamenti → clienti.
 *
 * Pagina di sola lettura: i dati arrivano da MarketingService (import JSON,
 * in futuro API Meta/Google). Ogni metrica di piattaforma può essere null
 * (= non ancora caricata) e viene resa come "—", mai come 0.
 */

// ── Formattazione ─────────────────────────────────────────────────────────────

const fmtInt  = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('it-IT').format(n);
const fmtEuro = (n: number | null | undefined, dec = 0) =>
    n == null ? '—' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
const fmtPct  = (r: number | null | undefined, dec = 1) => r == null ? '—' : `${(r * 100).toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: dec })} %`;

const GIORNI = ['dom', 'lun', 'mar', 'mer', 'gio', 'ven', 'sab'];

/** "2026-10-13 15:00" → { giorno: "mar 13/10", ora: "15:00" } (nessuna conversione di fuso: è già ora italiana) */
function splitDateTime(s: string | null | undefined): { giorno: string; ora: string; data: string } {
    if (!s) return { giorno: '—', ora: '', data: '—' };
    const [d, t = ''] = s.split(' ');
    const [y, m, g] = d.split('-').map(Number);
    const wd = GIORNI[new Date(y, m - 1, g).getDay()];
    const data = `${String(g).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
    return { giorno: `${wd} ${data}`, ora: t.slice(0, 5), data: `${data}/${y}` };
}
const fmtDateTime = (s: string | null | undefined) => {
    const p = splitDateTime(s);
    return p.ora ? `${p.giorno} · ${p.ora}` : p.giorno;
};

// ── Palette ───────────────────────────────────────────────────────────────────
// Categorica (identità piattaforma) in ordine fisso, dalla palette di riferimento
// validata per CVD; l'identità è sempre accompagnata dall'etichetta testuale.

const COLORE_PIATTAFORMA: Record<Piattaforma, string> = {
    facebook:    '#2a78d6',
    instagram:   '#e87ba4',
    google:      '#eda100',
    youtube:     '#e34948',
    display:     '#1baf7a',
    retargeting: '#4a3aa7',
    altro:       '#64748b',
};

// Stato (riservati, mai riusati per serie)
const OK      = '#22c55e';
const WARN    = '#f59e0b';
const DANGER  = '#ef4444';
const INFO    = '#3b82f6';   // --color-parlato
const NEUTRO  = '#64748b';
const VIOLA   = '#8b5cf6';

const COLORE_STATO_LEAD: Record<StatoLead, string> = {
    nuovo: INFO, contattato: INFO, qualificato: VIOLA, appuntamento: WARN, cliente: OK, perso: NEUTRO,
};
const COLORE_STATO_APP: Record<StatoAppuntamento, string> = {
    programmato: INFO, confermato: OK, completato: OK, annullato: NEUTRO, no_show: DANGER,
};
const COLORE_STATO_CAMPAGNA: Record<StatoCampagna, string> = {
    bozza: NEUTRO, attiva: OK, in_pausa: WARN, conclusa: NEUTRO,
};
const COLORE_ATTORE: Record<Attore, string> = { chip: INFO, umano: OK, cliente: NEUTRO };
const LABEL_ATTORE:  Record<Attore, string> = { chip: 'Chip', umano: 'Team', cliente: 'Cliente' };

const LABEL_TIPO_APP: Record<string, string> = { demo_online: 'Demo online', visita: 'Visita', chiamata: 'Chiamata' };

// ── Pagina ────────────────────────────────────────────────────────────────────

export default function Index(props: MarketingDashboardProps) {
    const { kpi, funnel, per_piattaforma, campagne, lead, appuntamenti, eventi, meta } = props;

    const prossimi = appuntamenti.filter(a => a.futuro && a.stato !== 'annullato');
    const passati  = appuntamenti.filter(a => !a.futuro || a.stato === 'annullato');
    const haDatiPiattaforma = kpi.impression != null || kpi.click != null || kpi.speso != null;

    return (
        <GestoreHotelLayout>
            <Head title="Marketing" />

            <div className="flex flex-col gap-5 max-w-[1400px] mx-auto">

                {/* ── Barra superiore ── */}
                <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                        <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Marketing
                            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                                funnel campagne → lead → appuntamenti
                            </span>
                        </h1>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Aggiornato al {fmtDateTime(meta.aggiornato_al)}
                            {' · '}
                            {campagne.length} {campagne.length === 1 ? 'campagna' : 'campagne'}
                            {' · '}budget totale {fmtEuro(kpi.budget)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Pill colore={INFO}>
                            <SparkIcon /> Contenuti generati con Chip
                        </Pill>
                        <Pill colore={meta.fonte_dati === 'api' ? OK : NEUTRO} title="Le metriche delle piattaforme (impression, click, spesa) vengono caricate manualmente. Il collegamento diretto alle API Meta/Google è il passo successivo.">
                            {meta.fonte_dati === 'api' ? 'Collegato alle piattaforme' : 'Dati piattaforme: caricamento manuale'}
                        </Pill>
                    </div>
                </div>

                {/* ── Avviso dati mancanti ── */}
                {!haDatiPiattaforma && (
                    <Nota>
                        Le metriche delle piattaforme (spesa, impression, click) non sono ancora state caricate:
                        le voci con «—» si riempiranno al primo aggiornamento. Lead e appuntamenti sono già reali.
                    </Nota>
                )}

                {/* ── KPI ── */}
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
                    <StatTile
                        label="Speso / budget"
                        valore={fmtEuro(kpi.speso)}
                        sotto={<>su {fmtEuro(kpi.budget)}{kpi.budget_pct != null && <> · {fmtPct(kpi.budget_pct, 0)}</>}</>}
                        meter={kpi.budget_pct}
                    />
                    <StatTile label="Impression" valore={fmtInt(kpi.impression)} sotto="visualizzazioni annunci" />
                    <StatTile label="Click" valore={fmtInt(kpi.click)} sotto={<>CTR {fmtPct(kpi.ctr, 2)}</>} />
                    <StatTile
                        label="Lead"
                        valore={fmtInt(kpi.lead)}
                        sotto={<>{kpi.lead_attivi} attivi · costo/lead {fmtEuro(kpi.cpl, 2)}</>}
                        accento={INFO}
                    />
                    <StatTile
                        label="Appuntamenti"
                        valore={fmtInt(kpi.appuntamenti)}
                        sotto={
                            <>
                                {fmtPct(kpi.tasso_lead_app, 0)} dei lead
                                {kpi.appuntamenti_chip > 0 && <> · {kpi.appuntamenti_chip} gestit{kpi.appuntamenti_chip === 1 ? 'o' : 'i'} da Chip</>}
                            </>
                        }
                        accento={WARN}
                    />
                    <StatTile label="Clienti" valore={fmtInt(kpi.clienti)} sotto={<>{fmtPct(kpi.tasso_app_cliente, 0)} degli appuntamenti</>} accento={OK} />
                </div>

                {/* ── Funnel ── */}
                <Card titolo="Funnel" sotto="ogni barra indica quanto dello stadio precedente passa a quello successivo">
                    <Funnel stadi={funnel} />
                </Card>

                {/* ── Campagne + piattaforme ── */}
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(280px, 1fr)' }}>
                    <Card titolo="Campagne" sotto={`${campagne.length} attive su Facebook, Instagram, Google, YouTube e retargeting`} padding={false}>
                        <TabellaCampagne campagne={campagne} />
                    </Card>
                    <Card titolo="Budget per piattaforma" sotto="barra piena = speso, traccia = budget">
                        <BudgetPiattaforme righe={per_piattaforma} />
                    </Card>
                </div>

                {/* ── Appuntamenti + Lead ── */}
                <div className="grid gap-4" style={{ gridTemplateColumns: 'minmax(300px, 1fr) minmax(0, 2fr)' }}>
                    <Card titolo="Appuntamenti" sotto={prossimi.length ? `${prossimi.length} in programma` : 'nessuno in programma'}>
                        <div className="flex flex-col gap-2.5">
                            {prossimi.length === 0 && passati.length === 0 && <Vuoto>Nessun appuntamento registrato.</Vuoto>}
                            {prossimi.map(a => <AppuntamentoCard key={a.id} a={a} />)}
                            {passati.length > 0 && (
                                <>
                                    <div className="text-[10px] uppercase tracking-wider mt-1" style={{ color: 'var(--color-text-muted)' }}>Passati</div>
                                    {passati.map(a => <AppuntamentoCard key={a.id} a={a} attenuato />)}
                                </>
                            )}
                        </div>
                    </Card>
                    <Card titolo="Lead" sotto={`${lead.length} ricevut${lead.length === 1 ? 'o' : 'i'} dalle campagne`} padding={false}>
                        <TabellaLead lead={lead} />
                    </Card>
                </div>

                {/* ── Timeline ── */}
                <Card titolo="Attività" sotto="cosa ha fatto Chip in automatico, cosa ha chiesto il cliente, cosa ha fatto il team">
                    <Timeline eventi={eventi} />
                </Card>
            </div>
        </GestoreHotelLayout>
    );
}

// ── Blocchi ───────────────────────────────────────────────────────────────────

function Card({ titolo, sotto, children, padding = true }: { titolo: string; sotto?: string; children: ReactNode; padding?: boolean }) {
    return (
        <section className="rounded-lg shadow-card overflow-hidden flex flex-col min-w-0"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
            <header className="flex items-baseline gap-2 px-4 py-2.5" style={{ borderBottom: '1px solid var(--color-border)' }}>
                <h2 className="text-xs font-semibold" style={{ color: 'var(--color-text-primary)' }}>{titolo}</h2>
                {sotto && <span className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sotto}</span>}
            </header>
            <div className={padding ? 'p-4' : ''}>{children}</div>
        </section>
    );
}

function StatTile({ label, valore, sotto, meter, accento }: { label: string; valore: string; sotto?: ReactNode; meter?: number | null; accento?: string }) {
    return (
        <div className="rounded-lg shadow-card px-4 py-3 flex flex-col gap-1 min-w-0"
            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderTop: `2px solid ${accento ?? 'var(--color-border)'}` }}>
            <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</div>
            <div className="font-semibold tabular-nums leading-none" style={{ fontSize: '26px', color: 'var(--color-text-primary)' }}>{valore}</div>
            {sotto && <div className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)' }}>{sotto}</div>}
            {meter !== undefined && (
                <div className="h-1.5 rounded-full mt-1 overflow-hidden" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }} title={meter == null ? 'Spesa non ancora caricata' : `${fmtPct(meter, 0)} del budget`}>
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, (meter ?? 0) * 100)}%`, backgroundColor: INFO, transition: 'width .3s' }} />
                </div>
            )}
        </div>
    );
}

function Funnel({ stadi }: { stadi: StadioFunnel[] }) {
    return (
        <div className="grid items-stretch gap-0" style={{ gridTemplateColumns: stadi.map(() => 'minmax(0,1fr)').join(' auto ') }}>
            {stadi.map((s, i) => {
                const prec = i > 0 ? stadi[i - 1].valore : null;
                const conv = i > 0 && prec != null && s.valore != null && prec > 0 ? s.valore / prec : null;
                const haPrecedente = i > 0;
                return (
                    <FunnelFrammento key={s.chiave} stadio={s} conv={conv} haPrecedente={haPrecedente} ultimo={i === stadi.length - 1} />
                );
            })}
        </div>
    );
}

function FunnelFrammento({ stadio, conv, haPrecedente, ultimo }: { stadio: StadioFunnel; conv: number | null; haPrecedente: boolean; ultimo: boolean }) {
    const mancante = stadio.valore == null;
    // Valore noto ma stadio precedente non caricato: la conversione non è calcolabile,
    // la barra resta tratteggiata (non vuota, che si leggerebbe come 0 %).
    const rapportoIgnoto = haPrecedente && !mancante && conv == null;
    const pct = conv == null ? 0 : Math.max(conv > 0 ? 3 : 0, Math.min(100, conv * 100));
    const tip = mancante ? `${stadio.label}: dato non ancora caricato`
        : haPrecedente ? `${stadio.label}: ${fmtInt(stadio.valore)} (${conv == null ? 'conversione n/d' : `${fmtPct(conv, 1)} dello stadio precedente`})`
        : `${stadio.label}: ${fmtInt(stadio.valore)}`;
    return (
        <>
            {haPrecedente && (
                <div className="flex items-center justify-center px-2 self-center" aria-hidden>
                    <span className="rounded-full px-1.5 py-0.5 text-[10px] tabular-nums whitespace-nowrap"
                        style={{ color: conv == null ? 'var(--color-text-muted)' : 'var(--color-text-secondary)', backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                        {conv == null ? '—' : fmtPct(conv, conv < 0.01 ? 2 : 1)}
                    </span>
                </div>
            )}
            <div className="flex flex-col gap-1.5 min-w-0" title={tip}>
                <div className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{stadio.label}</div>
                <div className="font-semibold tabular-nums leading-none" style={{ fontSize: '22px', color: mancante ? 'var(--color-text-muted)' : 'var(--color-text-primary)' }}>
                    {fmtInt(stadio.valore)}
                </div>
                <div className="h-2 rounded overflow-hidden" style={{ backgroundColor: 'rgba(59,130,246,0.12)' }}>
                    <div className="h-full rounded" style={{
                        width: haPrecedente && !rapportoIgnoto ? `${pct}%` : '100%',
                        backgroundColor: (mancante || rapportoIgnoto) ? 'transparent' : (ultimo ? OK : INFO),
                        backgroundImage: mancante
                            ? 'repeating-linear-gradient(135deg, rgba(100,116,139,0.35) 0 3px, transparent 3px 7px)'
                            : rapportoIgnoto
                                ? 'repeating-linear-gradient(135deg, rgba(59,130,246,0.55) 0 3px, transparent 3px 7px)'
                                : undefined,
                        transition: 'width .3s',
                    }} />
                </div>
            </div>
        </>
    );
}

function TabellaCampagne({ campagne }: { campagne: CampagnaRow[] }) {
    const cols: { label: string; align?: 'right' }[] = [
        { label: 'Piattaforma' }, { label: 'Campagna' }, { label: 'Stato' },
        { label: 'Budget', align: 'right' }, { label: 'Speso', align: 'right' },
        { label: 'Impression', align: 'right' }, { label: 'Click', align: 'right' }, { label: 'CTR', align: 'right' },
        { label: 'Lead', align: 'right' }, { label: '€/Lead', align: 'right' },
    ];
    return (
        <div className="overflow-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                        {cols.map(c => (
                            <th key={c.label} className="px-3 py-2 font-medium whitespace-nowrap"
                                style={{ color: 'var(--color-text-muted)', fontSize: '10px', letterSpacing: '0.04em', textAlign: c.align ?? 'left', borderBottom: '1px solid var(--color-border)' }}>
                                {c.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {campagne.length === 0 && (
                        <tr><td colSpan={cols.length} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Nessuna campagna registrata.</td></tr>
                    )}
                    {campagne.map((c, i) => (
                        <tr key={c.id} style={{ backgroundColor: i % 2 ? 'rgba(0,0,0,0.015)' : 'transparent' }} title={c.note ?? undefined}>
                            <td className="px-3 py-2.5 whitespace-nowrap"><PillPiattaforma p={c.piattaforma} label={c.piattaforma_label} /></td>
                            <td className="px-3 py-2.5 min-w-[180px]">
                                <div className="flex items-center gap-1.5">
                                    <span className="truncate" style={{ color: 'var(--color-text-primary)' }}>{c.nome}</span>
                                    {c.contenuti_ai && <span title="Creatività e testi generati con Chip" style={{ color: INFO, display: 'inline-flex' }}><SparkIcon /></span>}
                                </div>
                                {c.obiettivo && <div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{c.obiettivo}</div>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><Pill colore={COLORE_STATO_CAMPAGNA[c.stato]}>{c.stato_label}</Pill></td>
                            <Num>{fmtEuro(c.budget)}</Num>
                            <Num>
                                {fmtEuro(c.speso)}
                                {c.budget_pct != null && <span className="ml-1 text-[10px]" style={{ color: 'var(--color-text-muted)' }}>{fmtPct(c.budget_pct, 0)}</span>}
                            </Num>
                            <Num>{fmtInt(c.impression)}</Num>
                            <Num>{fmtInt(c.click)}</Num>
                            <Num>{fmtPct(c.ctr, 2)}</Num>
                            <Num forte>
                                {fmtInt(c.lead)}
                                {c.lead_dichiarati != null && c.lead_dichiarati !== c.lead && (
                                    <span className="ml-1 text-[10px]" title="Lead dichiarati dalla piattaforma" style={{ color: 'var(--color-text-muted)' }}>({c.lead_dichiarati})</span>
                                )}
                            </Num>
                            <Num>{fmtEuro(c.cpl, 2)}</Num>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Num({ children, forte }: { children: ReactNode; forte?: boolean }) {
    return (
        <td className="px-3 py-2.5 whitespace-nowrap text-right tabular-nums font-mono"
            style={{ color: forte ? 'var(--color-text-primary)' : 'var(--color-text-secondary)', fontWeight: forte ? 600 : 400 }}>
            {children}
        </td>
    );
}

function BudgetPiattaforme({ righe }: { righe: RiepilogoPiattaforma[] }) {
    const max = Math.max(1, ...righe.map(r => r.budget ?? r.speso ?? 0));
    if (righe.length === 0) return <Vuoto>Nessuna campagna.</Vuoto>;
    return (
        <div className="flex flex-col gap-3">
            {righe.map(r => {
                const wBudget = ((r.budget ?? 0) / max) * 100;
                const wSpeso  = ((r.speso ?? 0) / max) * 100;
                return (
                    <div key={r.piattaforma} className="flex flex-col gap-1" title={`${r.label}: speso ${fmtEuro(r.speso)} su ${fmtEuro(r.budget)} · ${r.lead} lead`}>
                        <div className="flex items-center justify-between text-[11px]">
                            <span className="flex items-center gap-1.5" style={{ color: 'var(--color-text-primary)' }}>
                                <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: COLORE_PIATTAFORMA[r.piattaforma] }} aria-hidden />
                                {r.label}
                                <span style={{ color: 'var(--color-text-muted)' }}>· {r.lead} lead</span>
                            </span>
                            <span className="tabular-nums font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                                {fmtEuro(r.speso)} <span style={{ color: 'var(--color-text-muted)' }}>/ {fmtEuro(r.budget)}</span>
                            </span>
                        </div>
                        <div className="relative h-2.5 rounded overflow-hidden" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                            <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${wBudget}%`, backgroundColor: 'rgba(59,130,246,0.14)' }} />
                            <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${wSpeso}%`, backgroundColor: INFO }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function AppuntamentoCard({ a, attenuato }: { a: AppuntamentoRow; attenuato?: boolean }) {
    const q = splitDateTime(a.inizio);
    const orig = splitDateTime(a.inizio_originale);
    const chip = a.gestito_da.startsWith('chip');
    return (
        <article className="rounded-md p-3 flex gap-3" style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-primary)', opacity: attenuato ? 0.65 : 1 }}>
            <div className="shrink-0 text-center rounded px-2 py-1.5 min-w-[64px]" style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                <div className="text-[10px] uppercase" style={{ color: 'var(--color-text-muted)' }}>{q.giorno}</div>
                <div className="font-semibold tabular-nums" style={{ fontSize: '16px', color: 'var(--color-text-primary)' }}>{q.ora}</div>
            </div>
            <div className="flex flex-col gap-1 min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{a.struttura ?? '—'}</span>
                    <Pill colore={COLORE_STATO_APP[a.stato]}>{a.stato_label}</Pill>
                    {a.spostato && <Pill colore={WARN}>Spostato</Pill>}
                </div>
                <div className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>
                    {LABEL_TIPO_APP[a.tipo] ?? a.tipo} · {a.durata_minuti} min
                    {a.referente && <> · {a.referente}</>}
                    {a.citta && <> · {a.citta}</>}
                </div>
                {a.spostato && (
                    <div className="text-[11px]" style={{ color: 'var(--color-text-secondary)' }}>
                        era <s style={{ color: 'var(--color-text-muted)' }}>{orig.giorno} · {orig.ora}</s> → ora {q.giorno} · {q.ora}
                    </div>
                )}
                <div className="flex items-center gap-1.5 text-[11px] mt-0.5" style={{ color: chip ? INFO : 'var(--color-text-secondary)' }}>
                    {chip ? <ChipIcon /> : <PersonIcon />}
                    {chip ? 'Gestito in automatico da Chip via WhatsApp' : 'Gestito dal team'}
                </div>
                {a.note && <p className="text-[11px] leading-snug mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{a.note}</p>}
            </div>
        </article>
    );
}

function TabellaLead({ lead }: { lead: LeadRow[] }) {
    const cols = ['Ricevuto', 'Struttura', 'Referente', 'Città', 'Fonte', 'Campagna', 'Stato', 'Gestione'];
    return (
        <div className="overflow-auto">
            <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                <thead>
                    <tr style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
                        {cols.map(c => (
                            <th key={c} className="px-3 py-2 font-medium text-left whitespace-nowrap"
                                style={{ color: 'var(--color-text-muted)', fontSize: '10px', letterSpacing: '0.04em', borderBottom: '1px solid var(--color-border)' }}>{c}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {lead.length === 0 && (
                        <tr><td colSpan={cols.length} className="px-4 py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Nessun lead ancora registrato.</td></tr>
                    )}
                    {lead.map((l, i) => (
                        <tr key={l.id} style={{ backgroundColor: i % 2 ? 'rgba(0,0,0,0.015)' : 'transparent' }} title={l.note ?? undefined}>
                            <td className="px-3 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--color-text-secondary)' }}>{fmtDateTime(l.ricevuto_at)}</td>
                            <td className="px-3 py-2.5 min-w-[140px]">
                                <div className="truncate" style={{ color: 'var(--color-text-primary)' }}>{l.struttura}</div>
                                {(l.telefono || l.email) && <div className="text-[10px] truncate" style={{ color: 'var(--color-text-muted)' }}>{[l.telefono, l.email].filter(Boolean).join(' · ')}</div>}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>{l.referente ?? '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>{l.citta ?? '—'}</td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                                {l.fonte ? <PillPiattaforma p={(l.fonte in COLORE_PIATTAFORMA ? l.fonte : 'altro') as Piattaforma} label={l.fonte_label ?? l.fonte} /> : '—'}
                            </td>
                            <td className="px-3 py-2.5 max-w-[160px]"><span className="truncate block" style={{ color: 'var(--color-text-muted)' }}>{l.campagna ?? '—'}</span></td>
                            <td className="px-3 py-2.5 whitespace-nowrap"><Pill colore={COLORE_STATO_LEAD[l.stato]}>{l.stato_label}</Pill></td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                                <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: l.gestito_da === 'chip' ? INFO : 'var(--color-text-secondary)' }}>
                                    {l.gestito_da === 'chip' ? <><ChipIcon /> Chip</> : <><PersonIcon /> Team</>}
                                </span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function Timeline({ eventi }: { eventi: EventoRow[] }) {
    if (eventi.length === 0) return <Vuoto>Nessuna attività registrata.</Vuoto>;
    return (
        <ol className="flex flex-col">
            {eventi.map((e, i) => {
                const attore = (e.attore in COLORE_ATTORE ? e.attore : 'umano') as Attore;
                const col = COLORE_ATTORE[attore];
                return (
                    <li key={e.id} className="flex gap-3 relative">
                        <div className="flex flex-col items-center shrink-0" style={{ width: '18px' }}>
                            <span className="rounded-full flex items-center justify-center shrink-0" style={{ width: '18px', height: '18px', backgroundColor: `${col}1a`, border: `1px solid ${col}`, color: col }}>
                                {attore === 'chip' ? <ChipIcon size={10} /> : <PersonIcon size={10} />}
                            </span>
                            {i < eventi.length - 1 && <span className="flex-1 w-px my-1" style={{ backgroundColor: 'var(--color-border)' }} />}
                        </div>
                        <div className="flex-1 min-w-0 pb-3">
                            <div className="flex items-center gap-2 flex-wrap text-[11px]">
                                <span className="font-medium" style={{ color: col }}>{LABEL_ATTORE[attore]}</span>
                                <span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{fmtDateTime(e.avvenuto_at)}</span>
                                {e.struttura && <span style={{ color: 'var(--color-text-muted)' }}>· {e.struttura}</span>}
                            </div>
                            <p className="text-xs leading-snug mt-0.5" style={{ color: 'var(--color-text-primary)' }}>{e.descrizione}</p>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

// ── Atomi ─────────────────────────────────────────────────────────────────────

function Pill({ colore, children, title }: { colore: string; children: ReactNode; title?: string }) {
    return (
        <span title={title} className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium whitespace-nowrap"
            style={{ fontSize: '10px', color: colore, backgroundColor: `${colore}14`, border: `1px solid ${colore}40` }}>
            {children}
        </span>
    );
}

function PillPiattaforma({ p, label }: { p: Piattaforma; label: string }) {
    return <Pill colore={COLORE_PIATTAFORMA[p]}>{label}</Pill>;
}

function Nota({ children }: { children: ReactNode }) {
    return (
        <div className="flex items-start gap-2 px-4 py-2 rounded-md text-xs" style={{ backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)', color: 'var(--color-text-secondary)' }}>
            <span style={{ color: INFO, fontWeight: 600 }}>ℹ</span>
            <span>{children}</span>
        </div>
    );
}

function Vuoto({ children }: { children: ReactNode }) {
    return <div className="py-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>{children}</div>;
}

function SparkIcon({ size = 11 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z" />
        </svg>
    );
}

function ChipIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <rect x="5" y="7" width="14" height="12" rx="3" />
            <circle cx="9.5" cy="13" r="1" fill="currentColor" /><circle cx="14.5" cy="13" r="1" fill="currentColor" />
            <path d="M12 3v4M9 19v2M15 19v2" />
        </svg>
    );
}

function PersonIcon({ size = 12 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" />
        </svg>
    );
}
