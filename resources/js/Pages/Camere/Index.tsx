import { Head, Link, router } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import { Camera } from '@/types';

interface HotelOption { id: string; nome: string; }

interface Props {
    camere: (Camera & { hotel?: { id: string; nome: string } })[];
    hotels: HotelOption[];
}

export default function CamereIndex({ camere, hotels }: Props) {
    const multiHotel = hotels.length > 1;

    const handleDelete = (id: string, nome: string) => {
        if (confirm(`Eliminare la camera «${nome}»?\nNon sarà possibile eliminarla se ha prenotazioni attive o future.`)) {
            router.delete(`/camere/${id}`, { preserveScroll: true });
        }
    };

    // Raggruppa per piano
    const perPiano = camere.reduce<Record<number, typeof camere>>((acc, c) => {
        (acc[c.piano] = acc[c.piano] ?? []).push(c);
        return acc;
    }, {});
    const pianiOrdinati = Object.entries(perPiano)
        .sort(([a], [b]) => Number(a) - Number(b));

    return (
        <GestoreHotelLayout>
            <Head title="Camere" />

            <div className="flex flex-col h-full">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-6 py-3 shrink-0"
                    style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Camere
                        <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                            {camere.length} configurate
                        </span>
                    </h1>
                    <Link
                        href="/camere/create"
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium"
                        style={{ backgroundColor: 'var(--color-parlato)', color: '#fff' }}>
                        <PlusIcon /> Nuova camera
                    </Link>
                </div>

                {/* ── Tabella ── */}
                <div className="flex-1 overflow-auto">
                    {camere.length === 0 ? (
                        <div className="flex items-center justify-center h-48">
                            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                Nessuna camera configurata. <Link href="/camere/create" className="underline" style={{ color: 'var(--color-parlato)' }}>Aggiungi la prima.</Link>
                            </p>
                        </div>
                    ) : (
                        <table className="w-full text-xs" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                            <thead>
                                <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                    {[
                                        { label: 'Nome', align: 'left' },
                                        { label: 'Tipo', align: 'left' },
                                        ...(multiHotel ? [{ label: 'Hotel', align: 'left' }] : []),
                                        { label: 'Piano', align: 'left' },
                                        { label: 'Letti', align: 'left' },
                                        { label: 'Mq', align: 'right' },
                                        { label: 'Dotazioni', align: 'left' },
                                        { label: 'Codice chiave', align: 'left' },
                                        { label: 'Prenotabile', align: 'center' },
                                        { label: 'AZIONI', align: 'center' },
                                    ].map(col => (
                                        <th key={col.label}
                                            className="px-4 py-2.5 font-medium select-none"
                                            style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em', fontSize: '10px', textAlign: col.align as 'left'|'right'|'center', whiteSpace: 'nowrap' }}>
                                            {col.label}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {pianiOrdinati.map(([piano, cList]) =>
                                    cList.map((c, idx) => (
                                        <CameraRow
                                            key={c.id}
                                            camera={c}
                                            multiHotel={multiHotel}
                                            even={(idx % 2) === 0}
                                            onDelete={handleDelete}
                                        />
                                    ))
                                )}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </GestoreHotelLayout>
    );
}

// ── Riga ──────────────────────────────────────────────────────────────────────

function CameraRow({
    camera: c, multiHotel, even, onDelete,
}: {
    camera: Camera & { hotel?: { id: string; nome: string } };
    multiHotel: boolean;
    even: boolean;
    onDelete: (id: string, nome: string) => void;
}) {
    const letti = [
        c.letti_matrimoniali ? `${c.letti_matrimoniali}M` : null,
        c.letti_singoli      ? `${c.letti_singoli}S`      : null,
        c.letti_aggiunti     ? `+${c.letti_aggiunti}`     : null,
        c.culle              ? `${c.culle}C`              : null,
    ].filter(Boolean).join(' ') || '—';

    const dotazioni = [
        c.doccia          && 'Doccia',
        c.vasca           && 'Vasca',
        c.minibar         && (c.minibar_pieno ? 'Minibar (pieno)' : 'Minibar'),
        c.aria_condizionata && 'AC',
    ].filter(Boolean).join(' · ') || '—';

    return (
        <tr style={{ backgroundColor: even ? 'transparent' : 'rgba(255,255,255,0.015)', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <td className="px-4 py-2.5 font-medium whitespace-nowrap" style={{ color: 'var(--color-text-primary)' }}>
                {c.nome}
            </td>
            <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                {c.tipo}
            </td>
            {multiHotel && (
                <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                    {c.hotel?.nome ?? '—'}
                </td>
            )}
            <td className="px-4 py-2.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                {c.piano === 0 ? 'T' : `P${c.piano}`}
            </td>
            <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: 'var(--color-text-secondary)' }}>
                {letti}
            </td>
            <td className="px-4 py-2.5 font-mono text-right whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                {c.mq != null ? `${c.mq}` : '—'}
            </td>
            <td className="px-4 py-2.5 max-w-48" style={{ color: 'var(--color-text-muted)' }}>
                <span className="truncate block">{dotazioni}</span>
            </td>
            <td className="px-4 py-2.5 font-mono whitespace-nowrap" style={{ color: 'var(--color-text-muted)' }}>
                {c.codice_chiave ?? '—'}
            </td>
            <td className="px-4 py-2.5 text-center">
                {c.booking_consentito
                    ? <span style={{ color: '#22c55e' }}>✓</span>
                    : <span style={{ color: '#64748b' }}>—</span>}
            </td>
            <td className="px-4 py-2.5">
                <div className="flex items-center justify-center gap-1">
                    <ActionLink href={`/camere/${c.id}`} title="Dettaglio" hoverColor="#60a5fa"><EyeIcon /></ActionLink>
                    <ActionLink href={`/camere/${c.id}/edit`} title="Modifica" hoverColor="#a78bfa"><EditIcon /></ActionLink>
                    <ActionBtn onClick={() => onDelete(c.id, c.nome)} title="Elimina" hoverColor="#ef4444"><TrashIcon /></ActionBtn>
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
function ActionBtn({ onClick, title, hoverColor, children }: { onClick: () => void; title: string; hoverColor: string; children: React.ReactNode }) {
    return (
        <button onClick={onClick} title={title}
            className="flex items-center justify-center rounded"
            style={{ width: '26px', height: '26px', color: 'var(--color-text-muted)' }}
            onMouseEnter={e => (e.currentTarget.style.color = hoverColor)}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
            {children}
        </button>
    );
}
function PlusIcon()  { return <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>; }
function EyeIcon()   { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>; }
function EditIcon()  { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>; }
function TrashIcon() { return <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>; }
