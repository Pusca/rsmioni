import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import AssegnazioneCamere from '@/Components/Prenotazioni/AssegnazioneCamere';
import SezioneDocumenti, { DocumentoItem } from '@/Components/Documenti/SezioneDocumenti';
import ViewerDocumenti from '@/Components/Documenti/ViewerDocumenti';
import ModalAcquisizione from '@/Components/Documenti/ModalAcquisizione';
import { Camera, CameraConDisponibilita, Prenotazione, Hotel, Profilo } from '@/types';

interface DocumentiCamera {
    camera_id:   string;
    camera_nome: string;
    documenti:   DocumentoItem[];
}

interface Props {
    prenotazione: Prenotazione & {
        hotel: Hotel;
        pagamenti: { id: string; importo: number; esito: string; created_at: string }[];
        camere: Camera[];
    };
    profilo: Profilo;
    puoCancellare: boolean;
    motivoCancellazione: string | null;
    camereDisponibili: CameraConDisponibilita[];
    documenti: DocumentoItem[];
    puoUploadDocumenti: boolean;
    documentiCamere: DocumentiCamera[];
    chioschi: Array<{ id: string; nome: string; has_stampante: boolean }>;
}

export default function Show({ prenotazione: pren, profilo, puoCancellare, motivoCancellazione, camereDisponibili, documenti, puoUploadDocumenti, documentiCamere, chioschi }: Props) {
    const isGestore = profilo === 'gestore_hotel';
    const Layout = isGestore ? GestoreHotelLayout : ReceptionistLayout;

    const [modalAcquisizione, setModalAcquisizione] = useState(false);
    const [viewerCamereIndice, setViewerCamereIndice] = useState<{ cameraId: string; indice: number } | null>(null);

    const ospite = [pren.nome, pren.cognome].filter(Boolean).join(' ') || pren.gruppo || '—';
    const pax    = pren.pax ? `${pren.pax.adulti} adulti${pren.pax.ragazzi ? `, ${pren.pax.ragazzi} ragazzi` : ''}${pren.pax.bambini ? `, ${pren.pax.bambini} bambini` : ''}` : '—';

    const handleDelete = () => {
        if (confirm('Confermi la cancellazione della prenotazione?')) {
            router.delete(`/prenotazioni/${pren.id}`);
        }
    };

    return (
        <Layout>
            <Head title={`Prenotazione ${pren.codice ?? pren.id.slice(0, 8)}`} />

            <div className="max-w-4xl mx-auto py-8 px-6">

                {/* ── Breadcrumb + header ── */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <Link href="/prenotazioni" style={{ color: 'var(--color-text-muted)' }} className="hover:underline">
                                Prenotazioni
                            </Link>
                            <span>/</span>
                            <span>{pren.codice ?? 'Dettaglio'}</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {ospite}
                            {pren.overbooking && (
                                <span className="ml-2 text-xs rounded px-2 py-0.5 font-mono uppercase"
                                    style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                                    OB
                                </span>
                            )}
                        </h1>
                        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {pren.hotel?.nome} — {pren.codice ?? 'Nessun codice'}
                        </p>
                    </div>

                    {/* Azioni header */}
                    <div className="flex items-center gap-2">
                        <Link
                            href={`/prenotazioni/${pren.id}/edit`}
                            className="px-4 py-2 rounded text-sm font-medium transition-colors"
                            style={{ backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-text-primary)', border: '1px solid var(--color-border)' }}
                        >
                            Modifica
                        </Link>
                        {puoCancellare ? (
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 rounded text-sm font-medium transition-colors"
                                style={{ backgroundColor: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}
                            >
                                Cancella
                            </button>
                        ) : motivoCancellazione ? (
                            <span className="text-xs px-3 py-1.5 rounded" style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                                {motivoCancellazione}
                            </span>
                        ) : null}
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-5">

                    {/* ── Colonna principale (2/3) ── */}
                    <div className="col-span-2 space-y-5">

                        {/* Dati prenotazione */}
                        <Card title="Dati prenotazione">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <DataRow label="Check-in"  value={formatDate(pren.check_in)} />
                                <DataRow label="Check-out" value={pren.check_out ? formatDate(pren.check_out) : '—'} />
                                <DataRow label="Ospiti"    value={pax} />
                                <DataRow label="Check-in confermato"
                                    value={pren.checkin_confermato ? <span style={{ color: '#22c55e' }}>✓ Sì</span> : '—'} />
                            </dl>
                        </Card>

                        {/* Camere assegnate + selettore */}
                        <Card title="Camere">
                            {/* Warning nessuna camera */}
                            {pren.camere?.length === 0 && profilo !== 'receptionist_lite' && (
                                <div className="mb-3 flex items-center gap-2 rounded px-3 py-2 text-xs"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                                    <WarningIcon /> Nessuna camera assegnata — assegna una o più camere qui sotto.
                                </div>
                            )}
                            {/* Warning overbooking */}
                            {pren.overbooking && (
                                <div className="mb-3 flex items-center gap-2 rounded px-3 py-2 text-xs"
                                    style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                                    <WarningIcon /> Prenotazione in overbooking — le camere occupate restano selezionabili.
                                </div>
                            )}

                            {profilo === 'receptionist_lite' ? (
                                /* RL: solo visualizzazione */
                                pren.camere?.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {pren.camere.map(c => (
                                            <span key={c.id}
                                                className="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                                                style={{ color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                                                {c.nome} <span className="ml-1 opacity-60">{c.tipo}</span>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nessuna camera assegnata.</p>
                                )
                            ) : (
                                <AssegnazioneCamere
                                    prenotazioneId={pren.id}
                                    camereAssegnate={pren.camere ?? []}
                                    camereDisponibili={camereDisponibili}
                                    profilo={profilo}
                                    overbooking={pren.overbooking}
                                />
                            )}
                        </Card>

                        {/* Pagamento */}
                        <Card title="Pagamento">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <DataRow label="Stato"
                                    value={
                                        <PillPagamento tipo={pren.tipo_pagamento} />
                                    } />
                                <DataRow label="Prezzo"
                                    value={pren.prezzo != null ? `€ ${Number(pren.prezzo).toFixed(2)}` : '—'} />
                            </dl>
                            {pren.pagamenti?.length > 0 && (
                                <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--color-border)' }}>
                                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>Transazioni POS</p>
                                    <div className="space-y-1">
                                        {pren.pagamenti.map(p => (
                                            <div key={p.id} className="flex justify-between text-xs" style={{ color: 'var(--color-text-secondary)' }}>
                                                <span>{formatDate(p.created_at)}</span>
                                                <span>€ {Number(p.importo).toFixed(2)}</span>
                                                <span style={{ color: p.esito === 'ok' ? '#22c55e' : '#ef4444' }}>{p.esito}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </Card>

                        {/* Documento identità — stato */}
                        <Card title="Documento identità">
                            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                                <DataRow label="Stato"
                                    value={<PillDocumento stato={pren.documento_identita} />} />
                            </dl>
                        </Card>

                        {/* Documenti prenotazione */}
                        <SezioneDocumenti
                            contestoTipo="prenotazione"
                            contestoId={pren.id}
                            documenti={documenti}
                            puoUpload={puoUploadDocumenti}
                            chioschi={chioschi}
                        />

                        {/* Documenti camere assegnate — consultazione operativa (RH24) */}
                        {documentiCamere.length > 0 && (
                            <Card title="Documenti camere assegnate">
                                <div className="space-y-4">
                                    {documentiCamere.map(dc => (
                                        <div key={dc.camera_id}>
                                            <p className="text-xs font-medium mb-2" style={{ color: 'var(--color-text-secondary)' }}>
                                                Camera {dc.camera_nome}
                                            </p>
                                            <DocumentiReadOnly
                                                documenti={dc.documenti}
                                                onApri={(indice) => setViewerCamereIndice({ cameraId: dc.camera_id, indice })}
                                            />
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}
                    </div>

                    {/* ── Colonna laterale (1/3) ── */}
                    <div className="space-y-5">

                        {/* Meta */}
                        <Card title="Informazioni">
                            <dl className="space-y-3 text-sm">
                                <DataRow label="Inserito da" value={labelProfilo(pren.inserito_da_profilo)} />
                                <DataRow label="Overbooking" value={pren.overbooking ? <span style={{ color: '#f59e0b' }}>Sì</span> : 'No'} />
                                {pren.gruppo && <DataRow label="Gruppo" value={pren.gruppo} />}
                            </dl>
                        </Card>

                        {/* Link rapidi */}
                        <Card title="Azioni rapide">
                            <div className="space-y-2">
                                <ActionBtn href={`/prenotazioni/${pren.id}/edit`}>
                                    Modifica prenotazione
                                </ActionBtn>
                                <ActionBtn href="/prenotazioni">
                                    Torna alla lista
                                </ActionBtn>
                                {/* Acquisizione documento — gestore e receptionist */}
                                {chioschi.length > 0 && profilo !== 'receptionist_lite' && (
                                    <button
                                        type="button"
                                        onClick={() => setModalAcquisizione(true)}
                                        className="block w-full text-center text-xs py-2 rounded transition-colors"
                                        style={{ color: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.25)' }}>
                                        Acquisisci documento da chiosco
                                    </button>
                                )}
                            </div>
                        </Card>
                    </div>
                </div>
            </div>

            {/* ── Modali ── */}
            {modalAcquisizione && (
                <ModalAcquisizione
                    prenotazioneId={pren.id}
                    chioschi={chioschi}
                    onClose={() => setModalAcquisizione(false)}
                />
            )}
            {viewerCamereIndice !== null && (() => {
                const dc = documentiCamere.find(d => d.camera_id === viewerCamereIndice.cameraId);
                if (!dc) return null;
                return (
                    <ViewerDocumenti
                        documenti={dc.documenti}
                        indiceIniziale={viewerCamereIndice.indice}
                        onClose={() => setViewerCamereIndice(null)}
                    />
                );
            })()}
        </Layout>
    );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatDate(d: string | null | undefined): string {
    if (!d) return '—';
    const date = new Date(d);
    return new Intl.DateTimeFormat('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
}

function labelProfilo(p: string): string {
    switch (p) {
        case 'gestore_hotel':    return 'Gestore Hotel';
        case 'receptionist':     return 'Receptionist';
        case 'receptionist_lite':return 'Receptionist Lite';
        default:                 return p;
    }
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
        <>
            <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</dt>
            <dd style={{ color: 'var(--color-text-secondary)' }}>{value}</dd>
        </>
    );
}

function ActionBtn({ href, children }: { href: string; children: React.ReactNode }) {
    return (
        <Link
            href={href}
            className="block w-full text-center text-xs py-2 rounded transition-colors"
            style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}
        >
            {children}
        </Link>
    );
}

function PillPagamento({ tipo }: { tipo: string }) {
    const isPagato = tipo === 'gia_pagato';
    return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{
                color:           isPagato ? '#22c55e' : '#f59e0b',
                backgroundColor: isPagato ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                border:          `1px solid ${isPagato ? 'rgba(34,197,94,0.3)' : 'rgba(245,158,11,0.3)'}`,
            }}>
            {isPagato ? 'Pagato' : 'Da pagare'}
        </span>
    );
}

function PillDocumento({ stato }: { stato: string }) {
    const isFornito = stato === 'gia_fornito';
    return (
        <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium"
            style={{
                color:           isFornito ? '#22c55e' : '#64748b',
                backgroundColor: isFornito ? 'rgba(34,197,94,0.1)' : 'rgba(100,116,139,0.1)',
                border:          `1px solid ${isFornito ? 'rgba(34,197,94,0.3)' : 'rgba(100,116,139,0.3)'}`,
            }}>
            {isFornito ? 'Fornito' : 'Da acquisire'}
        </span>
    );
}

function WarningIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
    );
}

/**
 * Lista read-only di documenti — usata per i documenti camera
 * nel contesto operativo della prenotazione (flusso RH24).
 */
function DocumentiReadOnly({ documenti, onApri }: { documenti: DocumentoItem[]; onApri: (indice: number) => void }) {
    if (documenti.length === 0) {
        return <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Nessun documento.</p>;
    }
    return (
        <div className="space-y-1">
            {documenti.map((doc, idx) => (
                <div key={doc.id}
                    className="flex items-center gap-3 rounded px-3 py-1.5"
                    style={{ backgroundColor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="rounded px-1.5 py-0.5 font-mono font-bold shrink-0"
                        style={{ fontSize: '9px', color: doc.estensione === 'pdf' ? '#f87171' : '#60a5fa', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                        {doc.estensione === 'pdf' ? 'PDF' : 'IMG'}
                    </span>
                    <span className="flex-1 text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                        {doc.titolo ?? 'Senza titolo'}
                        <span className="ml-1 font-mono" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>.{doc.estensione}</span>
                    </span>
                    {doc.tipo_documento && (
                        <span className="rounded px-1 font-mono shrink-0"
                            style={{ fontSize: '9px', color: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)' }}>
                            {doc.tipo_documento}
                        </span>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                        <button type="button"
                            onClick={() => onApri(idx)}
                            title="Apri"
                            className="flex items-center justify-center rounded text-xs px-2 py-0.5"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                            Apri
                        </button>
                        <a href={`/documenti/${doc.id}/download`}
                            title="Scarica"
                            className="flex items-center justify-center rounded text-xs px-2 py-0.5"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                            onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                            Scarica
                        </a>
                    </div>
                </div>
            ))}
        </div>
    );
}
