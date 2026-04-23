import { useState } from 'react';
import { Head, Link, router } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';

// ── Tipi ──────────────────────────────────────────────────────────────────────

type CategoriaVoce = 'infrastruttura' | 'browser' | 'applicazione' | 'hardware' | 'sistema' | 'verifica';
type TipoVoce     = 'manuale' | 'auto';
type StatoInst    = 'da_installare' | 'in_corso' | 'installato';

interface ChecklistVoce {
    key:       string;
    categoria: CategoriaVoce;
    label:     string;
    desc:      string;
    tipo:      TipoVoce;
    auto:      boolean | null;
}

interface ChioscoInstallazione {
    id:                      string;
    nome:                    string;
    tipo:                    string;
    attivo:                  boolean;
    interattivo:             boolean;
    has_pos:                 boolean;
    tipo_pos:                string | null;
    has_stampante:           boolean;
    path_input_pos:          string | null;
    path_output_pos:         string | null;
    ip_address:              string | null;
    stato_installazione:     StatoInst;
    note_installazione:      string | null;
    checklist_installazione: Record<string, boolean>;
    installato_at:           string | null;
    hotel:                   { id: string; nome: string } | null;
}

interface UltimoCollaudo {
    esito:       string;
    sorgente:    string;
    created_at:  string;
    eseguito_da: string | null;
}

interface Props {
    chiosco:         ChioscoInstallazione;
    checklist_voci:  ChecklistVoce[];
    url_kiosk:       string;
    ultimo_collaudo: UltimoCollaudo | null;
    presenza_online: boolean;
}

// ── Costanti UI ───────────────────────────────────────────────────────────────

const STATI: { value: StatoInst; label: string; color: string; bg: string }[] = [
    { value: 'da_installare', label: 'Da installare', color: '#5c6380', bg: 'rgba(92,99,128,0.1)'   },
    { value: 'in_corso',      label: 'In corso',      color: '#f59e0b', bg: 'rgba(245,158,11,0.1)'  },
    { value: 'installato',    label: 'Installato',    color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
];

const CATEGORIE: { key: CategoriaVoce; label: string; color: string }[] = [
    { key: 'infrastruttura', label: 'Infrastruttura',    color: '#60a5fa' },
    { key: 'browser',        label: 'Browser',           color: '#a78bfa' },
    { key: 'applicazione',   label: 'Applicazione',      color: '#34d399' },
    { key: 'hardware',       label: 'Hardware',          color: '#fb923c' },
    { key: 'sistema',        label: 'Sistema Operativo', color: '#f472b6' },
    { key: 'verifica',       label: 'Verifica finale',   color: '#22c55e' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function esitoColor(esito: string): string {
    switch (esito) {
        case 'superato': return '#22c55e';
        case 'parziale': return '#f59e0b';
        case 'fallito':  return '#ef4444';
        default:         return '#5c6380';
    }
}

function progressoInstallazione(
    voci:     ChecklistVoce[],
    checklist: Record<string, boolean>,
): { completate: number; totale: number; percentuale: number } {
    const manuali  = voci.filter(v => v.tipo === 'manuale');
    const autoVeri = voci.filter(v => v.tipo === 'auto' && v.auto === true);
    const completate = manuali.filter(v => checklist[v.key]).length + autoVeri.length;
    const totale     = voci.length;
    return { completate, totale, percentuale: totale > 0 ? Math.round((completate / totale) * 100) : 0 };
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function InstallazionePage({
    chiosco,
    checklist_voci,
    url_kiosk,
    ultimo_collaudo,
    presenza_online,
}: Props) {
    const [stato,     setStato]     = useState<StatoInst>(chiosco.stato_installazione);
    const [note,      setNote]      = useState(chiosco.note_installazione ?? '');
    const [checklist, setChecklist] = useState<Record<string, boolean>>(
        chiosco.checklist_installazione ?? {},
    );
    const [saving, setSaving] = useState(false);

    const prog = progressoInstallazione(checklist_voci, checklist);

    const toggleVoce = (key: string) => {
        setChecklist(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = () => {
        if (saving) return;
        setSaving(true);
        router.put(
            `/configurazioni/chioschi/${chiosco.id}/installazione`,
            { stato_installazione: stato, note_installazione: note || null, checklist } as never,
            { onFinish: () => setSaving(false) },
        );
    };

    const statoInfo = STATI.find(s => s.value === stato)!;

    return (
        <GestoreHotelLayout>
            <Head title={`Installazione — ${chiosco.nome}`} />

            <div className="max-w-5xl mx-auto py-8 px-6 space-y-6">

                {/* ── Header ──────────────────────────────────────────────── */}
                <div>
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        <Link href="/configurazioni/chioschi" style={{ color: 'var(--color-text-muted)' }}>Configurazioni</Link>
                        <span>/</span>
                        <Link href="/configurazioni/chioschi" style={{ color: 'var(--color-text-muted)' }}>Chioschi</Link>
                        <span>/</span>
                        <span>{chiosco.nome}</span>
                        <span>/</span>
                        <span>Installazione</span>
                    </div>
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                                Installazione — {chiosco.nome}
                            </h1>
                            {chiosco.hotel && (
                                <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                    {chiosco.hotel.nome}
                                </p>
                            )}
                        </div>

                        {/* Badge stato */}
                        <div className="flex items-center gap-2 shrink-0">
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: statoInfo.color }} />
                            <span className="text-sm font-medium" style={{ color: statoInfo.color }}>
                                {statoInfo.label}
                            </span>
                            {chiosco.installato_at && stato === 'installato' && (
                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    — {new Date(chiosco.installato_at).toLocaleDateString('it-IT')}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* ── Avanzamento ─────────────────────────────────────────── */}
                <div className="rounded-xl p-5"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Avanzamento installazione
                        </h2>
                        <span className="text-sm font-medium" style={{ color: prog.percentuale === 100 ? '#22c55e' : 'var(--color-text-secondary)' }}>
                            {prog.completate}/{prog.totale} voci completate ({prog.percentuale}%)
                        </span>
                    </div>
                    <div className="rounded-full overflow-hidden" style={{ height: 6, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                        <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                                width:           `${prog.percentuale}%`,
                                backgroundColor: prog.percentuale === 100 ? '#22c55e' : prog.percentuale > 50 ? '#f59e0b' : '#60a5fa',
                            }}
                        />
                    </div>
                </div>

                {/* ── Due colonne: dati provisioning + stato installazione ── */}
                <div className="grid grid-cols-2 gap-4">

                    {/* Dati provisioning */}
                    <div className="rounded-xl p-5 space-y-3"
                        style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                        <h2 className="text-xs font-semibold uppercase tracking-wider"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Dati di provisioning
                        </h2>
                        <DatiRow label="URL kiosk">
                            <span className="font-mono text-xs break-all" style={{ color: '#60a5fa' }}>
                                {url_kiosk}
                            </span>
                        </DatiRow>
                        <DatiRow label="Tipo chiosco">
                            <span className="uppercase font-mono text-xs"
                                style={{ color: chiosco.tipo === 'touch' ? '#60a5fa' : '#a78bfa' }}>
                                {chiosco.tipo}
                            </span>
                        </DatiRow>
                        <DatiRow label="Interattivo">
                            <BoolBadge value={chiosco.interattivo} />
                        </DatiRow>
                        <DatiRow label="IP address">
                            {chiosco.ip_address
                                ? <span className="font-mono text-xs">{chiosco.ip_address}</span>
                                : <span style={{ color: '#f59e0b', fontSize: '12px' }}>Non configurato</span>}
                        </DatiRow>
                        <DatiRow label="POS">
                            {chiosco.has_pos
                                ? <span style={{ color: '#10b981', fontSize: '12px' }}>{chiosco.tipo_pos ?? 'Sì'}</span>
                                : <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>No</span>}
                        </DatiRow>
                        {chiosco.has_pos && chiosco.tipo_pos === 'ingenico' && (
                            <>
                                <DatiRow label="Path input POS">
                                    <span className="font-mono text-xs break-all"
                                        style={{ color: chiosco.path_input_pos ? 'var(--color-text-primary)' : '#f59e0b', fontSize: '11px' }}>
                                        {chiosco.path_input_pos ?? 'Non configurato'}
                                    </span>
                                </DatiRow>
                                <DatiRow label="Path output POS">
                                    <span className="font-mono text-xs break-all"
                                        style={{ color: chiosco.path_output_pos ? 'var(--color-text-primary)' : '#f59e0b', fontSize: '11px' }}>
                                        {chiosco.path_output_pos ?? 'Non configurato'}
                                    </span>
                                </DatiRow>
                            </>
                        )}
                        <DatiRow label="Stampante">
                            <BoolBadge value={chiosco.has_stampante} goodWhenTrue={false} />
                        </DatiRow>
                        <DatiRow label="Attivo">
                            <BoolBadge value={chiosco.attivo} />
                        </DatiRow>
                    </div>

                    {/* Stato installazione + link correlati */}
                    <div className="space-y-4">

                        {/* Selettore stato */}
                        <div className="rounded-xl p-5 space-y-3"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <h2 className="text-xs font-semibold uppercase tracking-wider"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Stato installazione
                            </h2>
                            <div className="space-y-2">
                                {STATI.map(s => (
                                    <button
                                        key={s.value}
                                        onClick={() => setStato(s.value)}
                                        className="w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-all"
                                        style={{
                                            backgroundColor: stato === s.value ? s.bg : 'transparent',
                                            border:          `1px solid ${stato === s.value ? s.color + '60' : 'var(--color-border)'}`,
                                            cursor:          'pointer',
                                        }}>
                                        <span className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: stato === s.value ? s.color : '#2e3348' }} />
                                        <span className="text-sm font-medium"
                                            style={{ color: stato === s.value ? s.color : 'var(--color-text-muted)' }}>
                                            {s.label}
                                        </span>
                                        {stato === s.value && (
                                            <span className="ml-auto text-xs" style={{ color: s.color }}>✓</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Link a moduli correlati */}
                        <div className="rounded-xl p-5 space-y-2"
                            style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                            <h2 className="text-xs font-semibold uppercase tracking-wider mb-3"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Moduli correlati
                            </h2>

                            <ModuloLink
                                href={`/configurazioni/chioschi/${chiosco.id}/edit`}
                                color="#60a5fa"
                                label="Configurazione"
                                desc="Parametri, IP, hardware, POS"
                            />
                            <ModuloLink
                                href={`/configurazioni/chioschi/${chiosco.id}/collaudo`}
                                color="#22c55e"
                                label="Collaudo"
                                desc={ultimo_collaudo
                                    ? `Ultimo: ${ultimo_collaudo.esito} (${new Date(ultimo_collaudo.created_at).toLocaleDateString('it-IT')})`
                                    : 'Nessun collaudo eseguito'}
                                badgeColor={ultimo_collaudo ? esitoColor(ultimo_collaudo.esito) : undefined}
                                badgeLabel={ultimo_collaudo?.esito}
                            />
                            <ModuloLink
                                href={`/configurazioni/chioschi/${chiosco.id}/diagnostica`}
                                color="#f59e0b"
                                label="Diagnostica runtime"
                                desc={presenza_online ? 'Browser online — heartbeat attivo' : 'Browser offline'}
                                badgeColor={presenza_online ? '#22c55e' : '#5c6380'}
                                badgeLabel={presenza_online ? 'Online' : 'Offline'}
                            />
                        </div>
                    </div>
                </div>

                {/* ── Checklist installazione ──────────────────────────────── */}
                <div className="rounded-xl overflow-hidden"
                    style={{ border: '1px solid var(--color-border)' }}>
                    <div className="px-5 py-4"
                        style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Checklist installazione
                        </h2>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Le voci <strong>Manuali</strong> devono essere spuntate dall'installatore on-site.
                            Le voci <strong>Auto</strong> sono rilevate automaticamente dal sistema.
                        </p>
                    </div>

                    {CATEGORIE.map(cat => {
                        const voci = checklist_voci.filter(v => v.categoria === cat.key);
                        if (voci.length === 0) return null;

                        return (
                            <div key={cat.key}>
                                {/* Categoria header */}
                                <div className="px-5 py-2 flex items-center gap-2"
                                    style={{ backgroundColor: `${cat.color}08`, borderBottom: '1px solid var(--color-border)' }}>
                                    <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: cat.color }} />
                                    <span className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: cat.color }}>
                                        {cat.label}
                                    </span>
                                </div>

                                {/* Voci */}
                                {voci.map((voce, i) => {
                                    const isAuto     = voce.tipo === 'auto';
                                    const isChecked  = isAuto ? (voce.auto ?? false) : (checklist[voce.key] ?? false);
                                    const isLast     = i === voci.length - 1;

                                    return (
                                        <div
                                            key={voce.key}
                                            className="flex items-start gap-4 px-5 py-4"
                                            style={{
                                                borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
                                                backgroundColor: isChecked ? 'rgba(34,197,94,0.02)' : 'transparent',
                                            }}>

                                            {/* Checkbox o indicatore auto */}
                                            {isAuto ? (
                                                <div className="mt-0.5 shrink-0 flex flex-col items-center gap-1">
                                                    <span
                                                        className="flex items-center justify-center rounded"
                                                        style={{
                                                            width:           18,
                                                            height:          18,
                                                            backgroundColor: isChecked ? 'rgba(34,197,94,0.15)' : 'rgba(92,99,128,0.15)',
                                                            border:          `1px solid ${isChecked ? 'rgba(34,197,94,0.5)' : '#2e3348'}`,
                                                        }}>
                                                        {isChecked && (
                                                            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#22c55e" strokeWidth="2">
                                                                <polyline points="2 6 5 9 10 3" />
                                                            </svg>
                                                        )}
                                                    </span>
                                                </div>
                                            ) : (
                                                <button
                                                    onClick={() => toggleVoce(voce.key)}
                                                    className="mt-0.5 shrink-0 flex items-center justify-center rounded transition-all"
                                                    style={{
                                                        width:           18,
                                                        height:          18,
                                                        backgroundColor: isChecked ? '#22c55e' : 'transparent',
                                                        border:          `2px solid ${isChecked ? '#22c55e' : '#2e3348'}`,
                                                        cursor:          'pointer',
                                                    }}>
                                                    {isChecked && (
                                                        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5">
                                                            <polyline points="2 6 5 9 10 3" />
                                                        </svg>
                                                    )}
                                                </button>
                                            )}

                                            {/* Testo */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="text-sm font-medium"
                                                        style={{ color: isChecked ? '#22c55e' : 'var(--color-text-primary)' }}>
                                                        {voce.label}
                                                    </span>
                                                    <TipoBadge tipo={voce.tipo} />
                                                </div>
                                                <p className="text-xs mt-0.5 leading-relaxed"
                                                    style={{ color: 'var(--color-text-muted)' }}>
                                                    {voce.desc}
                                                </p>
                                                {/* Nota speciale per voce collaudo */}
                                                {voce.key === 'collaudo' && !isChecked && (
                                                    <Link
                                                        href={`/configurazioni/chioschi/${chiosco.id}/collaudo`}
                                                        className="inline-block mt-1 text-xs"
                                                        style={{ color: '#22c55e', textDecoration: 'underline' }}>
                                                        Vai al collaudo →
                                                    </Link>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>

                {/* ── Note libere ─────────────────────────────────────────── */}
                <div className="rounded-xl p-5"
                    style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
                    <h2 className="text-xs font-semibold uppercase tracking-wider mb-3"
                        style={{ color: 'var(--color-text-muted)' }}>
                        Note installazione
                    </h2>
                    <textarea
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        rows={4}
                        placeholder="Note libere: anomalie riscontrate, configurazioni particolari, riferimenti tecnici…"
                        className="w-full rounded-lg px-4 py-3 text-sm resize-none"
                        style={{
                            backgroundColor: 'rgba(255,255,255,0.03)',
                            border:          '1px solid var(--color-border)',
                            color:           'var(--color-text-primary)',
                            outline:         'none',
                        }}
                    />
                </div>

                {/* ── Azioni ──────────────────────────────────────────────── */}
                <div className="flex items-center justify-between pb-4">
                    <Link
                        href="/configurazioni/chioschi"
                        className="px-4 py-2 rounded-lg text-sm"
                        style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                        ← Torna ai chioschi
                    </Link>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="px-6 py-2.5 rounded-lg text-sm font-medium transition-all"
                        style={{
                            backgroundColor: saving ? 'rgba(59,130,246,0.4)' : '#3b82f6',
                            color:           '#fff',
                            border:          'none',
                            cursor:          saving ? 'default' : 'pointer',
                        }}>
                        {saving ? 'Salvataggio…' : 'Salva stato installazione'}
                    </button>
                </div>
            </div>
        </GestoreHotelLayout>
    );
}

// ── Componenti di supporto ────────────────────────────────────────────────────

function DatiRow({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-start justify-between gap-4 text-sm py-1"
            style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <span className="shrink-0" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span style={{ color: 'var(--color-text-primary)', textAlign: 'right' }}>{children}</span>
        </div>
    );
}

function BoolBadge({ value, goodWhenTrue = true }: { value: boolean; goodWhenTrue?: boolean }) {
    const isGood = goodWhenTrue ? value : !value;
    return (
        <span className="text-xs" style={{ color: isGood ? '#22c55e' : 'var(--color-text-muted)' }}>
            {value ? 'Sì' : 'No'}
        </span>
    );
}

function TipoBadge({ tipo }: { tipo: TipoVoce }) {
    return (
        <span className="text-xs px-1.5 py-0.5 rounded font-mono uppercase tracking-wide"
            style={{
                backgroundColor: tipo === 'auto' ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)',
                color:           tipo === 'auto' ? '#60a5fa' : '#a78bfa',
                border:          `1px solid ${tipo === 'auto' ? 'rgba(96,165,250,0.2)' : 'rgba(167,139,250,0.2)'}`,
                fontSize:        '10px',
            }}>
            {tipo === 'auto' ? 'auto' : 'manuale'}
        </span>
    );
}

function ModuloLink({
    href, color, label, desc, badgeColor, badgeLabel,
}: {
    href:         string;
    color:        string;
    label:        string;
    desc:         string;
    badgeColor?:  string;
    badgeLabel?:  string;
}) {
    return (
        <Link
            href={href}
            className="flex items-start gap-3 rounded-lg px-3 py-3 transition-all group"
            style={{ border: '1px solid var(--color-border)', display: 'flex' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = color + '60')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--color-border)')}>
            <span className="mt-1 w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {label}
                    </span>
                    {badgeLabel && badgeColor && (
                        <span className="text-xs px-1.5 py-0.5 rounded font-mono"
                            style={{ backgroundColor: `${badgeColor}15`, color: badgeColor, border: `1px solid ${badgeColor}30` }}>
                            {badgeLabel}
                        </span>
                    )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{desc}</p>
            </div>
            <span className="text-sm shrink-0" style={{ color: 'var(--color-text-muted)' }}>→</span>
        </Link>
    );
}
