import { Head, Link, router } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import { Profilo, CategoriaRegola } from '@/types';

interface HotelOption { id: string; nome: string; lingue_abilitate: string[]; }

interface RegolaRow {
    id: string;
    codice: string;
    categoria: CategoriaRegola;
    ordine: number;
    testo_it: string | null;
    valorizzata: boolean;
}

interface Props {
    regole:   RegolaRow[];
    hotels:   HotelOption[];
    hotel_id: string | null;
    profilo:  Profilo;
}

// ── Etichette ─────────────────────────────────────────────────────────────────

const CATEGORIA_LABEL: Record<CategoriaRegola, string> = {
    generale:  'Generali Hotel',
    turistica: 'Turistiche',
    supporto:  'Supporto Cliente',
    sicurezza: 'Sicurezza / Emergenza',
};

const CATEGORIA_COLOR: Record<CategoriaRegola, string> = {
    generale:  '#60a5fa',
    turistica: '#34d399',
    supporto:  '#a78bfa',
    sicurezza: '#f87171',
};

export function regolaLabel(codice: string): string {
    return codice
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, l => l.toUpperCase());
}

const CATEGORIE: CategoriaRegola[] = ['generale', 'turistica', 'supporto', 'sicurezza'];

// ── Componente principale ─────────────────────────────────────────────────────

export default function RegolamentoIndex({ regole, hotels, hotel_id, profilo }: Props) {
    const isGestore = profilo === 'gestore_hotel';
    const Layout    = isGestore ? GestoreHotelLayout : ReceptionistLayout;

    const handleHotelChange = (id: string) => {
        router.get('/regolamento', { hotel_id: id }, { preserveState: true, replace: true });
    };

    const perCategoria = CATEGORIE.reduce<Record<string, RegolaRow[]>>((acc, cat) => {
        acc[cat] = regole.filter(r => r.categoria === cat);
        return acc;
    }, {});

    const totale       = regole.length;
    const valorizzate  = regole.filter(r => r.valorizzata).length;

    return (
        <Layout>
            <Head title="Regolamento" />

            <div className="flex flex-col h-full">

                {/* ── Barra superiore ── */}
                <div className="flex items-center justify-between px-6 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <div className="flex items-center gap-4">
                        <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Regolamento
                        </h1>
                        {/* Completamento */}
                        <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.08)' }}>
                                <div className="h-full rounded-full transition-all"
                                    style={{ width: `${totale ? (valorizzate / totale) * 100 : 0}%`, backgroundColor: '#22c55e' }} />
                            </div>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {valorizzate}/{totale} valorizzate
                            </span>
                        </div>
                    </div>

                    {/* Hotel selector */}
                    {hotels.length > 1 && (
                        <select
                            value={hotel_id ?? ''}
                            onChange={e => handleHotelChange(e.target.value)}
                            className="rounded px-3 py-1.5 text-xs outline-none"
                            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        >
                            {hotels.map(h => <option key={h.id} value={h.id}>{h.nome}</option>)}
                        </select>
                    )}
                </div>

                {/* ── Contenuto ── */}
                <div className="flex-1 overflow-auto px-6 py-5 space-y-8">
                    {CATEGORIE.map(cat => {
                        const rows = perCategoria[cat] ?? [];
                        if (rows.length === 0) return null;
                        const val = rows.filter(r => r.valorizzata).length;

                        return (
                            <section key={cat}>
                                {/* Header categoria */}
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: CATEGORIA_COLOR[cat] }} />
                                    <h2 className="text-xs font-semibold uppercase tracking-wider"
                                        style={{ color: CATEGORIA_COLOR[cat] }}>
                                        {CATEGORIA_LABEL[cat]}
                                    </h2>
                                    <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        {val}/{rows.length}
                                    </span>
                                </div>

                                {/* Tabella regole */}
                                <div className="rounded-lg overflow-hidden"
                                    style={{ border: '1px solid var(--color-border)' }}>
                                    <table className="w-full text-xs" style={{ borderCollapse: 'collapse' }}>
                                        <tbody>
                                            {rows.map((r, idx) => (
                                                <RegolaRow
                                                    key={r.id}
                                                    regola={r}
                                                    hotelId={hotel_id}
                                                    isGestore={isGestore}
                                                    even={idx % 2 === 0}
                                                />
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>
                        );
                    })}
                </div>
            </div>
        </Layout>
    );
}

// ── Riga regola ───────────────────────────────────────────────────────────────

function RegolaRow({
    regola: r, hotelId, isGestore, even,
}: {
    regola: RegolaRow;
    hotelId: string | null;
    isGestore: boolean;
    even: boolean;
}) {
    const href       = `/regolamento/${r.id}${hotelId ? `?hotel_id=${hotelId}` : ''}`;
    const hrefEdit   = `/regolamento/${r.id}/edit${hotelId ? `?hotel_id=${hotelId}` : ''}`;
    const preview    = r.testo_it ? r.testo_it.slice(0, 80).replace(/\n/g, ' ') + (r.testo_it.length > 80 ? '…' : '') : null;

    return (
        <tr style={{
            backgroundColor: even ? 'transparent' : 'rgba(255,255,255,0.015)',
            borderBottom:    '1px solid rgba(255,255,255,0.04)',
        }}>
            {/* Nome regola */}
            <td className="px-4 py-3" style={{ width: '220px', minWidth: '160px' }}>
                <Link href={href}
                    className="font-medium hover:underline"
                    style={{ color: 'var(--color-text-primary)' }}>
                    {regolaLabel(r.codice)}
                </Link>
            </td>

            {/* Preview contenuto */}
            <td className="px-4 py-3 max-w-0">
                {preview ? (
                    <span className="truncate block" style={{ color: 'var(--color-text-muted)' }}>
                        {preview}
                    </span>
                ) : (
                    <span className="italic" style={{ color: 'var(--color-text-muted)', opacity: 0.5 }}>
                        Non ancora valorizzata
                    </span>
                )}
            </td>

            {/* Stato pill */}
            <td className="px-4 py-3 whitespace-nowrap" style={{ width: '110px' }}>
                {r.valorizzata ? (
                    <span className="inline-flex items-center rounded px-2 py-0.5 font-medium"
                        style={{ fontSize: '10px', color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                        Valorizzata
                    </span>
                ) : (
                    <span className="inline-flex items-center rounded px-2 py-0.5 font-medium"
                        style={{ fontSize: '10px', color: '#64748b', backgroundColor: 'rgba(100,116,139,0.08)', border: '1px solid rgba(100,116,139,0.25)' }}>
                        Da compilare
                    </span>
                )}
            </td>

            {/* AZIONI */}
            <td className="px-4 py-3 whitespace-nowrap" style={{ width: '80px' }}>
                <div className="flex items-center justify-end gap-1">
                    <ActionLink href={href} title="Visualizza" hoverColor="#60a5fa"><EyeIcon /></ActionLink>
                    {isGestore && (
                        <ActionLink href={hrefEdit} title="Valorizza" hoverColor="#a78bfa"><EditIcon /></ActionLink>
                    )}
                </div>
            </td>
        </tr>
    );
}

// ── Icone e wrappers ──────────────────────────────────────────────────────────

function ActionLink({ href, title, hoverColor, children }: { href: string; title: string; hoverColor: string; children: React.ReactNode }) {
    return (
        <Link href={href} title={title}
            className="flex items-center justify-center rounded"
            style={{ width: '26px', height: '26px', color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = hoverColor)}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
            {children}
        </Link>
    );
}
function EyeIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function EditIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
