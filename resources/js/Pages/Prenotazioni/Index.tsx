import { Head, Link, router } from '@inertiajs/react';
import { useCallback, useRef, useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import { HotelConfig, Paginated, Prenotazione, Profilo, TipoPagamento, StatoDocumentoIdentita } from '@/types';

// Il controller arricchisce ogni Prenotazione con puo_cancellare
type PrenotazioneRow = Prenotazione & {
    puo_cancellare: boolean;
    hotel?: { id: string; nome: string };
};

interface Filtri {
    cerca?: string;
    data_dal?: string;
    data_al?: string;
    stato_pagamento?: TipoPagamento | '';
    stato_documento?: StatoDocumentoIdentita | '';
}

interface Props {
    prenotazioni: Paginated<PrenotazioneRow>;
    hotels: HotelConfig[];
    profilo: Profilo;
    filtri: Filtri;
    can: { create: boolean };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    const [y, m, g] = d.split('-');
    return `${g}/${m}/${y}`;
}

function ospiteLabel(p: PrenotazioneRow): string {
    if (p.nome || p.cognome) return [p.nome, p.cognome].filter(Boolean).join(' ');
    if (p.gruppo) return p.gruppo;
    return '—';
}

function paxLabel(p: PrenotazioneRow): string {
    const a = p.pax?.adulti ?? 0;
    const r = p.pax?.ragazzi ?? 0;
    const b = p.pax?.bambini ?? 0;
    return [a && `${a}A`, r && `${r}R`, b && `${b}B`].filter(Boolean).join(' ');
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function Index({ prenotazioni, hotels, profilo, filtri, can }: Props) {
    const isGestore = profilo === 'gestore_hotel';
    const Layout    = isGestore ? GestoreHotelLayout : ReceptionistLayout;

    const [cerca,          setCerca]         = useState(filtri.cerca ?? '');
    const [dataDal,        setDataDal]       = useState(filtri.data_dal ?? '');
    const [dataAl,         setDataAl]        = useState(filtri.data_al ?? '');
    const [statoPagamento, setStatoPagamento]= useState<string>(filtri.stato_pagamento ?? '');
    const [statoDocumento, setStatoDocumento]= useState<string>(filtri.stato_documento ?? '');

    const searchTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

    const applyFiltri = useCallback((overrides?: Partial<Filtri>) => {
        const o = overrides ?? {};
        const params: Record<string, string> = {};
        const cerca_v     = o.cerca           !== undefined ? o.cerca           : cerca;
        const data_dal_v  = o.data_dal        !== undefined ? o.data_dal        : dataDal;
        const data_al_v   = o.data_al         !== undefined ? o.data_al         : dataAl;
        const stato_pag_v = o.stato_pagamento !== undefined ? o.stato_pagamento : statoPagamento;
        const stato_doc_v = o.stato_documento !== undefined ? o.stato_documento : statoDocumento;

        if (cerca_v)      params.cerca           = cerca_v;
        if (data_dal_v)   params.data_dal        = data_dal_v;
        if (data_al_v)    params.data_al         = data_al_v;
        if (stato_pag_v)  params.stato_pagamento = stato_pag_v;
        if (stato_doc_v)  params.stato_documento = stato_doc_v;

        router.get('/prenotazioni', params, { preserveState: true, replace: true });
    }, [cerca, dataDal, dataAl, statoPagamento, statoDocumento]);

    const handleCercaChange = (v: string) => {
        setCerca(v);
        clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(() => applyFiltri({ cerca: v }), 400);
    };

    const handleDelete = (id: string) => {
        if (confirm('Confermi la cancellazione?')) {
            router.delete(`/prenotazioni/${id}`, { preserveScroll: true });
        }
    };

    const resetFiltri = () => {
        setCerca(''); setDataDal(''); setDataAl('');
        setStatoPagamento(''); setStatoDocumento('');
        router.get('/prenotazioni', {}, { preserveState: true, replace: true });
    };

    const hasFiltri = !!(cerca || dataDal || dataAl || statoPagamento || statoDocumento);

    return (
        <Layout>
            <Head title="Prenotazioni" />

            <div className="flex flex-col h-full">

                {/* ── Barra superiore ── */}
                <div
                    className="flex items-center justify-between px-6 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--color-border)' }}
                >
                    <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Prenotazioni
                        <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                            {prenotazioni.total} totali
                        </span>
                    </h1>
                    {can.create && (
                        <Link
                            href="/prenotazioni/create"
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                            style={{ backgroundColor: 'var(--color-parlato)', color: '#fff' }}
                        >
                            <PlusIcon />
                            Nuova
                        </Link>
                    )}
                </div>

                {/* ── Filtri ── */}
                <div
                    className="flex flex-wrap items-end gap-3 px-6 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}
                >
                    {/* Cerca */}
                    <div className="flex-1 min-w-48">
                        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Cerca</label>
                        <input
                            type="text"
                            value={cerca}
                            onChange={e => handleCercaChange(e.target.value)}
                            placeholder="Nome, cognome, codice, gruppo…"
                            className="w-full rounded px-3 py-1.5 text-xs outline-none"
                            style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                border:          '1px solid var(--color-border)',
                                color:           'var(--color-text-primary)',
                            }}
                        />
                    </div>

                    {/* Data dal */}
                    <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Check-in dal</label>
                        <input type="date" value={dataDal}
                            onChange={e => { setDataDal(e.target.value); applyFiltri({ data_dal: e.target.value }); }}
                            className="rounded px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        />
                    </div>

                    {/* Data al */}
                    <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Check-in al</label>
                        <input type="date" value={dataAl}
                            onChange={e => { setDataAl(e.target.value); applyFiltri({ data_al: e.target.value }); }}
                            className="rounded px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        />
                    </div>

                    {/* Stato pagamento */}
                    <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Pagamento</label>
                        <select value={statoPagamento}
                            onChange={e => { setStatoPagamento(e.target.value); applyFiltri({ stato_pagamento: e.target.value as TipoPagamento | '' }); }}
                            className="rounded px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        >
                            <option value="">Tutti</option>
                            <option value="gia_pagato">Pagato</option>
                            <option value="da_pagare">Da pagare</option>
                        </select>
                    </div>

                    {/* Stato documento */}
                    <div>
                        <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Documento</label>
                        <select value={statoDocumento}
                            onChange={e => { setStatoDocumento(e.target.value); applyFiltri({ stato_documento: e.target.value as StatoDocumentoIdentita | '' }); }}
                            className="rounded px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        >
                            <option value="">Tutti</option>
                            <option value="gia_fornito">Fornito</option>
                            <option value="da_acquisire">Da acquisire</option>
                        </select>
                    </div>

                    {hasFiltri && (
                        <button onClick={resetFiltri}
                            className="px-3 py-1.5 rounded text-xs"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            Azzera
                        </button>
                    )}
                </div>

                {/* ── Tabella ── */}
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                        <thead>
                            <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                {[
                                    { label: 'Check-in', align: 'left' },
                                    { label: 'Check-out', align: 'left' },
                                    { label: 'Ospite / Gruppo', align: 'left' },
                                    { label: 'Ospiti', align: 'left' },
                                    { label: 'Hotel', align: 'left' },
                                    { label: 'Pagamento', align: 'left' },
                                    { label: 'Documento', align: 'left' },
                                    { label: 'Prezzo', align: 'right' },
                                    { label: 'AZIONI', align: 'center' },
                                ].map(col => (
                                    <th key={col.label}
                                        className="px-4 py-2.5 font-medium select-none"
                                        style={{
                                            color:         'var(--color-text-muted)',
                                            letterSpacing: '0.04em',
                                            fontSize:      '10px',
                                            textAlign:     col.align as 'left' | 'right' | 'center',
                                            whiteSpace:    'nowrap',
                                        }}>
                                        {col.label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {prenotazioni.data.length === 0 && (
                                <tr>
                                    <td colSpan={9} className="px-4 py-10 text-center" style={{ color: 'var(--color-text-muted)' }}>
                                        Nessuna prenotazione trovata.
                                    </td>
                                </tr>
                            )}
                            {prenotazioni.data.map((p, idx) => (
                                <RowPrenotazione
                                    key={p.id}
                                    pren={p}
                                    onDelete={handleDelete}
                                    even={idx % 2 === 0}
                                />
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* ── Paginazione ── */}
                {prenotazioni.last_page > 1 && (
                    <div
                        className="flex items-center justify-between px-6 py-3 shrink-0 text-xs"
                        style={{ borderTop: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                    >
                        <span>
                            {prenotazioni.from}–{prenotazioni.to} di {prenotazioni.total}
                        </span>
                        <div className="flex gap-1">
                            {prenotazioni.links.map((link, i) => (
                                link.url ? (
                                    <Link
                                        key={i}
                                        href={link.url}
                                        preserveState
                                        className="px-2.5 py-1 rounded"
                                        style={{
                                            backgroundColor: link.active ? 'var(--color-parlato)' : 'rgba(255,255,255,0.04)',
                                            color:           link.active ? '#fff' : 'var(--color-text-muted)',
                                            border:          '1px solid var(--color-border)',
                                        }}
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                    />
                                ) : (
                                    <span
                                        key={i}
                                        className="px-2.5 py-1 rounded opacity-30"
                                        style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
                                        dangerouslySetInnerHTML={{ __html: link.label }}
                                    />
                                )
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </Layout>
    );
}

// ── Riga tabella ──────────────────────────────────────────────────────────────

function RowPrenotazione({
    pren, onDelete, even,
}: {
    pren:     PrenotazioneRow;
    onDelete: (id: string) => void;
    even:     boolean;
}) {
    const ospite  = ospiteLabel(pren);
    const isGruppo = !pren.nome && !pren.cognome && !!pren.gruppo;

    return (
        <tr style={{
            backgroundColor: even ? 'transparent' : 'rgba(255,255,255,0.015)',
            borderBottom:    '1px solid rgba(255,255,255,0.04)',
        }}>
            {/* Check-in */}
            <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--color-text-secondary)' }}>
                {formatDate(pren.check_in)}
                {pren.checkin_confermato && (
                    <span className="ml-1.5" style={{ color: '#22c55e' }} title="Check-in confermato">✓</span>
                )}
            </td>

            {/* Check-out */}
            <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {formatDate(pren.check_out)}
            </td>

            {/* Ospite / Gruppo */}
            <td className="px-4 py-2.5 max-w-48">
                <div className="flex items-center gap-2">
                    {pren.overbooking && (
                        <span className="shrink-0 rounded px-1.5 py-0.5 font-mono"
                            style={{ fontSize: '9px', color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.25)' }}>
                            OB
                        </span>
                    )}
                    <span className="truncate" style={{ color: 'var(--color-text-primary)', fontStyle: isGruppo ? 'italic' : 'normal' }}>
                        {ospite}
                    </span>
                    {pren.codice && (
                        <span className="shrink-0 font-mono" style={{ fontSize: '10px', color: 'var(--color-text-muted)' }}>
                            {pren.codice}
                        </span>
                    )}
                </div>
            </td>

            {/* PAX */}
            <td className="px-4 py-2.5 whitespace-nowrap font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {paxLabel(pren)}
            </td>

            {/* Hotel */}
            <td className="px-4 py-2.5 max-w-32">
                <span className="truncate block" style={{ color: 'var(--color-text-muted)' }}>
                    {pren.hotel?.nome ?? '—'}
                </span>
            </td>

            {/* Pagamento */}
            <td className="px-4 py-2.5 whitespace-nowrap">
                <PillPagamento tipo={pren.tipo_pagamento} />
            </td>

            {/* Documento */}
            <td className="px-4 py-2.5 whitespace-nowrap">
                <PillDocumento stato={pren.documento_identita} />
            </td>

            {/* Prezzo */}
            <td className="px-4 py-2.5 whitespace-nowrap font-mono text-right" style={{ color: 'var(--color-text-secondary)' }}>
                {pren.prezzo != null ? `€ ${Number(pren.prezzo).toFixed(2)}` : '—'}
            </td>

            {/* AZIONI */}
            <td className="px-4 py-2.5 whitespace-nowrap">
                <div className="flex items-center justify-center gap-1">
                    <ActionIconLink href={`/prenotazioni/${pren.id}`} title="Dettaglio" hoverColor="#60a5fa">
                        <EyeIcon />
                    </ActionIconLink>
                    <ActionIconLink href={`/prenotazioni/${pren.id}/edit`} title="Modifica" hoverColor="#a78bfa">
                        <EditIcon />
                    </ActionIconLink>
                    {pren.puo_cancellare && (
                        <ActionIconBtn onClick={() => onDelete(pren.id)} title="Cancella" hoverColor="#ef4444">
                            <TrashIcon />
                        </ActionIconBtn>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ── Pills ──────────────────────────────────────────────────────────────────────

function PillPagamento({ tipo }: { tipo: string }) {
    const ok = tipo === 'gia_pagato';
    return (
        <span className="inline-flex items-center rounded px-2 py-0.5 font-medium"
            style={{
                fontSize:        '10px',
                color:           ok ? '#22c55e' : '#f59e0b',
                backgroundColor: ok ? 'rgba(34,197,94,0.08)' : 'rgba(245,158,11,0.08)',
                border:          `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(245,158,11,0.25)'}`,
            }}>
            {ok ? 'Pagato' : 'Da pagare'}
        </span>
    );
}

function PillDocumento({ stato }: { stato: string }) {
    const ok = stato === 'gia_fornito';
    return (
        <span className="inline-flex items-center rounded px-2 py-0.5 font-medium"
            style={{
                fontSize:        '10px',
                color:           ok ? '#22c55e' : '#64748b',
                backgroundColor: ok ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.08)',
                border:          `1px solid ${ok ? 'rgba(34,197,94,0.25)' : 'rgba(100,116,139,0.25)'}`,
            }}>
            {ok ? 'Fornito' : 'Da acquisire'}
        </span>
    );
}

// ── Icone + wrappers ──────────────────────────────────────────────────────────

function ActionIconLink({ href, title, hoverColor, children }: { href: string; title: string; hoverColor: string; children: React.ReactNode }) {
    return (
        <Link href={href} title={title}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: '26px', height: '26px', color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
            {children}
        </Link>
    );
}

function ActionIconBtn({ onClick, title, hoverColor, children }: { onClick: () => void; title: string; hoverColor: string; children: React.ReactNode }) {
    return (
        <button onClick={onClick} title={title}
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: '26px', height: '26px', color: 'var(--color-text-muted)' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
            {children}
        </button>
    );
}

function PlusIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
        </svg>
    );
}
function EyeIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
        </svg>
    );
}
function EditIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
    );
}
function TrashIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" /><path d="M9 6V4h6v2" />
        </svg>
    );
}
