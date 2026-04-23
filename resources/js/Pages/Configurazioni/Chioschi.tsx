import { Head, Link, router } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';

interface ChioscoItem {
    id:            string;
    nome:          string;
    tipo:          string;
    attivo:        boolean;
    interattivo:   boolean;
    has_pos:       boolean;
    tipo_pos:      string | null;
    has_stampante: boolean;
    ip_address:    string | null;
    hotel:         { id: string; nome: string } | null;
}

interface HotelItem {
    id:   string;
    nome: string;
}

interface Props {
    chioschi: ChioscoItem[];
    hotels:   HotelItem[];
}

export default function ChioschiConfig({ chioschi, hotels }: Props) {
    const multiHotel = hotels.length > 1;

    return (
        <GestoreHotelLayout>
            <Head title="Configurazioni Chioschi" />

            <div className="max-w-5xl mx-auto py-8 px-6">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <span>Configurazioni</span><span>/</span><span>Chioschi</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Configurazioni Chioschi
                        </h1>
                    </div>
                    <Link href="/configurazioni/chioschi/crea"
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none' }}>
                        + Nuovo chiosco
                    </Link>
                </div>

                {/* Sub-nav */}
                <ConfigSubNav active="chioschi" />

                {chioschi.length === 0 ? (
                    <div className="rounded-xl p-10 text-center"
                        style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Nessun chiosco configurato.{' '}
                            <Link href="/configurazioni/chioschi/crea" style={{ color: '#3b82f6' }}>
                                Aggiungine uno.
                            </Link>
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl overflow-hidden"
                        style={{ border: '1px solid var(--color-border)' }}>
                        <table className="w-full text-sm">
                            <thead>
                                <tr style={{ backgroundColor: 'var(--color-bg-secondary)', borderBottom: '1px solid var(--color-border)' }}>
                                    <Th>Nome</Th>
                                    {multiHotel && <Th>Hotel</Th>}
                                    <Th>Tipo</Th>
                                    <Th>Stato</Th>
                                    <Th>Funzioni</Th>
                                    <Th>IP</Th>
                                    <Th align="right">Azioni</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {chioschi.map((c, i) => (
                                    <tr key={c.id}
                                        style={{
                                            backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                        }}>
                                        <Td>
                                            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                                {c.nome}
                                            </span>
                                        </Td>
                                        {multiHotel && <Td>{c.hotel?.nome ?? '—'}</Td>}
                                        <Td>
                                            <span className="rounded px-2 py-0.5 text-xs font-mono uppercase"
                                                style={{
                                                    color:           c.tipo === 'touch' ? '#60a5fa' : '#a78bfa',
                                                    backgroundColor: c.tipo === 'touch' ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)',
                                                    border:          `1px solid ${c.tipo === 'touch' ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)'}`,
                                                }}>
                                                {c.tipo}
                                            </span>
                                        </Td>
                                        <Td>
                                            <span className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full"
                                                    style={{ backgroundColor: c.attivo ? '#22c55e' : '#5c6380' }} />
                                                <span style={{ color: c.attivo ? '#22c55e' : 'var(--color-text-muted)', fontSize: '12px' }}>
                                                    {c.attivo ? 'Attivo' : 'Inattivo'}
                                                </span>
                                            </span>
                                        </Td>
                                        <Td>
                                            <div className="flex items-center gap-1.5 flex-wrap">
                                                {c.interattivo && <FuncBadge color="#22c55e">Interattivo</FuncBadge>}
                                                {c.has_pos && <FuncBadge color="#10b981">POS {c.tipo_pos ? `(${c.tipo_pos})` : ''}</FuncBadge>}
                                                {c.has_stampante && <FuncBadge color="#7c3aed">Stampante</FuncBadge>}
                                            </div>
                                        </Td>
                                        <Td>
                                            <span className="font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                {c.ip_address ?? '—'}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <div className="flex items-center justify-end gap-2">
                                                <Link href={`/configurazioni/chioschi/${c.id}/installazione`}
                                                    className="px-3 py-1 rounded text-xs transition-colors"
                                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                                    Installazione
                                                </Link>
                                                <Link href={`/configurazioni/chioschi/${c.id}/diagnostica`}
                                                    className="px-3 py-1 rounded text-xs transition-colors"
                                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#f59e0b')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                                    Diagnostica
                                                </Link>
                                                <Link href={`/configurazioni/chioschi/${c.id}/collaudo`}
                                                    className="px-3 py-1 rounded text-xs transition-colors"
                                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#22c55e')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                                    Collaudo
                                                </Link>
                                                <Link href={`/configurazioni/chioschi/${c.id}/edit`}
                                                    className="px-3 py-1 rounded text-xs transition-colors"
                                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                                                    onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                                    Modifica
                                                </Link>
                                            </div>
                                        </Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </GestoreHotelLayout>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ConfigSubNav({ active }: { active: 'hotel' | 'chioschi' }) {
    return (
        <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
            {([
                { key: 'hotel',    href: '/configurazioni/hotel',    label: 'Hotel'    },
                { key: 'chioschi', href: '/configurazioni/chioschi', label: 'Chioschi' },
            ] as const).map(tab => (
                <Link key={tab.key} href={tab.href}
                    className="px-4 py-2 text-sm font-medium transition-colors"
                    style={{
                        color:        active === tab.key ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                        borderBottom: active === tab.key ? '2px solid #3b82f6' : '2px solid transparent',
                        marginBottom: '-1px',
                    }}>
                    {tab.label}
                </Link>
            ))}
        </div>
    );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
    return (
        <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)', textAlign: align }}>
            {children}
        </th>
    );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
    return (
        <td className="px-4 py-3" style={{ color: 'var(--color-text-secondary)', textAlign: align }}>
            {children}
        </td>
    );
}

function FuncBadge({ children, color }: { children: React.ReactNode; color: string }) {
    return (
        <span className="rounded px-1.5 py-0.5 text-xs"
            style={{ color, backgroundColor: `${color}18`, border: `1px solid ${color}40` }}>
            {children}
        </span>
    );
}
