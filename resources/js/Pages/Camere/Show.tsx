import { Head, Link, router } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import SezioneDocumenti, { DocumentoItem } from '@/Components/Documenti/SezioneDocumenti';
import { Camera } from '@/types';

interface Props {
    camera: Camera;
    puoCancellare: boolean;
    documenti: DocumentoItem[];
    puoUploadDocumenti: boolean;
    chioschi: Array<{ id: string; nome: string; has_stampante: boolean }>;
}

export default function CameraShow({ camera: c, puoCancellare, documenti, puoUploadDocumenti, chioschi }: Props) {
    const handleDelete = () => {
        if (confirm(`Eliminare la camera «${c.nome}»?`)) {
            router.delete(`/camere/${c.id}`);
        }
    };

    const letti = [
        c.letti_matrimoniali        ? `${c.letti_matrimoniali} matrimoniali`        : null,
        c.letti_singoli             ? `${c.letti_singoli} singoli`                  : null,
        c.letti_aggiunti            ? `${c.letti_aggiunti} aggiunti`                : null,
        c.divani_letto_singoli      ? `${c.divani_letto_singoli} div. sing.`        : null,
        c.divani_letto_matrimoniali ? `${c.divani_letto_matrimoniali} div. matr.`   : null,
        c.culle                     ? `${c.culle} culle`                            : null,
    ].filter(Boolean);

    return (
        <GestoreHotelLayout>
            <Head title={`Camera ${c.nome}`} />

            <div className="max-w-3xl mx-auto py-8 px-6">

                {/* ── Breadcrumb + header ── */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <Link href="/camere" className="hover:underline" style={{ color: 'var(--color-text-muted)' }}>Camere</Link>
                            <span>/</span><span>{c.nome}</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Camera {c.nome}
                            {!c.booking_consentito && (
                                <span className="ml-2 text-xs rounded px-2 py-0.5 font-mono"
                                    style={{ color: '#64748b', backgroundColor: 'rgba(100,116,139,0.1)', border: '1px solid rgba(100,116,139,0.3)' }}>
                                    Non prenotabile
                                </span>
                            )}
                        </h1>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {c.tipo} · {c.piano === 0 ? 'Piano terra' : `Piano ${c.piano}`}
                            {c.mq != null && <> · {c.mq} m²</>}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href={`/camere/${c.id}/edit`}
                            className="px-4 py-2 rounded text-sm font-medium"
                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}>
                            Modifica
                        </Link>
                        {puoCancellare ? (
                            <button onClick={handleDelete}
                                className="px-4 py-2 rounded text-sm font-medium"
                                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                Elimina
                            </button>
                        ) : (
                            <span className="text-xs px-3 py-1.5 rounded"
                                style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                                Ha prenotazioni attive
                            </span>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-5">

                    {/* ── Colonna principale ── */}
                    <div className="col-span-2 space-y-5">

                        <Card title="Composizione letti">
                            {letti.length > 0 ? (
                                <ul className="space-y-1">
                                    {letti.map((l, i) => (
                                        <li key={i} className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                            <span style={{ color: 'var(--color-parlato)' }}>·</span> {l}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Nessun letto configurato.</p>
                            )}
                        </Card>

                        <Card title="Dotazioni">
                            <div className="grid grid-cols-3 gap-3">
                                {[
                                    { label: 'Doccia',          value: c.doccia },
                                    { label: 'Vasca',           value: c.vasca },
                                    { label: 'Minibar',         value: c.minibar },
                                    { label: 'Minibar pieno',   value: c.minibar_pieno },
                                    { label: 'Aria condizionata', value: c.aria_condizionata },
                                ].map(({ label, value }) => (
                                    <div key={label} className="flex items-center gap-2 text-sm">
                                        <span style={{ color: value ? '#22c55e' : '#64748b' }}>
                                            {value ? '✓' : '○'}
                                        </span>
                                        <span style={{ color: value ? 'var(--color-text-secondary)' : 'var(--color-text-muted)' }}>
                                            {label}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        {c.quadro_elettrico && (
                            <Card title="Quadro elettrico">
                                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{c.quadro_elettrico}</p>
                            </Card>
                        )}

                        <SezioneDocumenti
                            contestoTipo="camera"
                            contestoId={c.id}
                            documenti={documenti}
                            puoUpload={puoUploadDocumenti}
                            chioschi={chioschi}
                        />
                    </div>

                    {/* ── Colonna laterale ── */}
                    <div className="space-y-5">
                        <Card title="Dettagli">
                            <dl className="space-y-3 text-sm">
                                <DataRow label="Codice chiave" value={c.codice_chiave ?? '—'} />
                                <DataRow label="Superficie"    value={c.mq != null ? `${c.mq} m²` : '—'} />
                                <DataRow label="Prenotabile"
                                    value={
                                        <span style={{ color: c.booking_consentito ? '#22c55e' : '#64748b' }}>
                                            {c.booking_consentito ? 'Sì' : 'No'}
                                        </span>
                                    } />
                            </dl>
                        </Card>

                        <Card title="Azioni rapide">
                            <div className="space-y-2">
                                <ActionBtn href={`/camere/${c.id}/edit`}>Modifica camera</ActionBtn>
                                <ActionBtn href="/camere">Torna alla lista</ActionBtn>
                                <ActionBtn href="/prenotazioni">Lista prenotazioni</ActionBtn>
                            </div>
                        </Card>
                    </div>
                </div>
            </div>
        </GestoreHotelLayout>
    );
}

// ── Sub-componenti ─────────────────────────────────────────────────────────────

function Card({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg p-5" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
                {title}
            </h3>
            {children}
        </div>
    );
}

function DataRow({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div>
            <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
            <dd className="mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>{value}</dd>
        </div>
    );
}

function ActionBtn({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link href={href}
            className="block w-full text-center text-xs py-2 rounded"
            style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
            {children}
        </Link>
    );
}
