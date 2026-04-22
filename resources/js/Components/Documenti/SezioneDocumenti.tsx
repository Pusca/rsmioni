import { useForm, router } from '@inertiajs/react';
import { FormEvent, useRef, useState } from 'react';
import { ContestoDocumento, Profilo } from '@/types';
import ViewerDocumenti from './ViewerDocumenti';
import ModalInvioDocumento from './ModalInvioDocumento';
import ModalStampaDocumento from './ModalStampaDocumento';

export interface DocumentoItem {
    id: string;
    titolo: string | null;
    lingua: string | null;
    tipo_documento: string | null;
    estensione: 'pdf' | 'png' | 'jpg' | 'jpeg';
    inserito_da_profilo: Profilo;
    created_at: string;
    puo_cancellare: boolean;
    puo_inviare: boolean;
    puo_stampare: boolean;
}

interface Props {
    contestoTipo: ContestoDocumento;
    contestoId:   string;
    documenti:    DocumentoItem[];
    puoUpload:    boolean;
    /** Se true, nasconde il titolo della card (per embed in sezioni esistenti) */
    inlineTitle?: string;
    /** Chioschi disponibili per stampa remota (opzionale: se assente, il pulsante stampa non appare) */
    chioschi?: Array<{ id: string; nome: string; has_stampante?: boolean }>;
}

// ── Costanti ──────────────────────────────────────────────────────────────────

const EXT_LABEL: Record<string, string> = { pdf: 'PDF', png: 'IMG', jpg: 'IMG', jpeg: 'IMG' };
const EXT_COLOR: Record<string, string> = { pdf: '#f87171', png: '#60a5fa', jpg: '#60a5fa', jpeg: '#60a5fa' };

const PROFILO_LABEL: Record<string, string> = {
    gestore_hotel:    'Gestore',
    receptionist:     'Receptionist',
    receptionist_lite:'R. Lite',
};

const LINGUA_OPTIONS = [
    { value: '',   label: '— Lingua —' },
    { value: 'it', label: 'Italiano' },
    { value: 'en', label: 'English' },
    { value: 'de', label: 'Deutsch' },
    { value: 'fr', label: 'Français' },
    { value: 'es', label: 'Español' },
];

const TIPO_DOCUMENTO_OPTIONS = [
    { value: '',                label: '— Tipo documento —' },
    { value: 'carta_identita',  label: 'Documento identità' },
    { value: 'passaporto',      label: 'Passaporto' },
    { value: 'patente',         label: 'Patente' },
    { value: 'planimetria',     label: 'Planimetria' },
    { value: 'foto',            label: 'Fotografia' },
    { value: 'contratto',       label: 'Contratto' },
    { value: 'normativa',       label: 'Normativa' },
    { value: 'allegato',        label: 'Allegato regolamento' },
    { value: 'modulo',          label: 'Modulo' },
    { value: 'altro',           label: 'Altro' },
];

function tipoLabel(tipo: string | null): string | null {
    if (!tipo) return null;
    return TIPO_DOCUMENTO_OPTIONS.find(o => o.value === tipo)?.label ?? tipo;
}

function linguaLabel(lingua: string | null): string | null {
    if (!lingua) return null;
    return LINGUA_OPTIONS.find(o => o.value === lingua)?.label ?? lingua.toUpperCase();
}

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
    }).format(new Date(iso));
}

// ── Componente principale ─────────────────────────────────────────────────────

export default function SezioneDocumenti({
    contestoTipo, contestoId, documenti, puoUpload, inlineTitle, chioschi,
}: Props) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [viewerIndice,    setViewerIndice]    = useState<number | null>(null);
    const [invioDocumento,  setInvioDocumento]  = useState<DocumentoItem | null>(null);
    const [stampaDocumento, setStampaDocumento] = useState<DocumentoItem | null>(null);

    // Chioschi con stampante (filtra quelli senza has_stampante=false)
    const chioschiStampante = (chioschi ?? []).filter(c => c.has_stampante !== false);

    const form = useForm<{
        contesto_tipo:  ContestoDocumento;
        contesto_id:    string;
        titolo:         string;
        lingua:         string;
        tipo_documento: string;
        file:           File | null;
    }>({
        contesto_tipo:  contestoTipo,
        contesto_id:    contestoId,
        titolo:         '',
        lingua:         '',
        tipo_documento: '',
        file:           null,
    });

    const handleUpload = (e: FormEvent) => {
        e.preventDefault();
        if (!form.data.file) return;

        form.post('/documenti', {
            forceFormData: true,
            onSuccess: () => {
                form.reset('titolo', 'lingua', 'tipo_documento', 'file');
                if (fileInputRef.current) fileInputRef.current.value = '';
            },
        });
    };

    const handleDelete = (id: string, titolo: string | null) => {
        if (!confirm(`Eliminare il documento «${titolo ?? 'senza titolo'}»?`)) return;
        router.delete(`/documenti/${id}`);
    };

    const title = inlineTitle ?? 'Documenti allegati';

    return (
        <>
        {viewerIndice !== null && (
            <ViewerDocumenti
                documenti={documenti}
                indiceIniziale={viewerIndice}
                onClose={() => setViewerIndice(null)}
            />
        )}
        {invioDocumento && (
            <ModalInvioDocumento
                documentoId={invioDocumento.id}
                titoloDocumento={invioDocumento.titolo}
                onClose={() => setInvioDocumento(null)}
            />
        )}
        {stampaDocumento && (
            <ModalStampaDocumento
                documentoId={stampaDocumento.id}
                titoloDocumento={stampaDocumento.titolo}
                chioschi={chioschi ?? []}
                onClose={() => setStampaDocumento(null)}
            />
        )}
        <div className="rounded-lg p-5"
            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>

            {/* Header — nascosto se inlineTitle è stringa vuota */}
            {title !== '' && (
                <h3 className="text-xs font-semibold uppercase tracking-wider mb-4"
                    style={{ color: 'var(--color-text-muted)' }}>
                    {title}
                    {documenti.length > 0 && (
                        <span className="ml-2 rounded px-1.5 py-0.5 font-mono"
                            style={{ fontSize: '10px', backgroundColor: 'rgba(255,255,255,0.06)', color: 'var(--color-text-muted)' }}>
                            {documenti.length}
                        </span>
                    )}
                </h3>
            )}

            {/* Lista documenti */}
            {documenti.length > 0 ? (
                <div className="space-y-1 mb-4">
                    {documenti.map(doc => (
                        <div key={doc.id}
                            className="flex items-start gap-3 rounded px-3 py-2"
                            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>

                            {/* Ext badge */}
                            <span className="rounded px-1.5 py-0.5 font-mono font-bold shrink-0 mt-0.5"
                                style={{ fontSize: '9px', color: EXT_COLOR[doc.estensione] ?? '#94a3b8', backgroundColor: 'rgba(255,255,255,0.06)' }}>
                                {EXT_LABEL[doc.estensione] ?? doc.estensione.toUpperCase()}
                            </span>

                            {/* Titolo + metadati */}
                            <div className="flex-1 min-w-0">
                                <p className="text-xs truncate" style={{ color: 'var(--color-text-secondary)' }}>
                                    {doc.titolo ?? 'Senza titolo'}
                                    <span className="ml-1 font-mono" style={{ color: 'var(--color-text-muted)', fontSize: '10px' }}>
                                        .{doc.estensione}
                                    </span>
                                </p>
                                {(doc.tipo_documento || doc.lingua) && (
                                    <p className="flex items-center gap-1.5 mt-0.5">
                                        {tipoLabel(doc.tipo_documento) && (
                                            <span className="rounded px-1 font-mono"
                                                style={{ fontSize: '9px', color: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)' }}>
                                                {tipoLabel(doc.tipo_documento)}
                                            </span>
                                        )}
                                        {linguaLabel(doc.lingua) && (
                                            <span className="rounded px-1 font-mono"
                                                style={{ fontSize: '9px', color: '#34d399', backgroundColor: 'rgba(52,211,153,0.08)' }}>
                                                {linguaLabel(doc.lingua)}
                                            </span>
                                        )}
                                    </p>
                                )}
                            </div>

                            {/* Data + profilo */}
                            <div className="flex flex-col items-end gap-1 shrink-0">
                                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {formatDate(doc.created_at)}
                                </span>
                                <span className="rounded px-1.5 py-0.5"
                                    style={{ fontSize: '9px', color: '#94a3b8', backgroundColor: 'rgba(255,255,255,0.04)' }}>
                                    {PROFILO_LABEL[doc.inserito_da_profilo] ?? doc.inserito_da_profilo}
                                </span>
                            </div>

                            {/* Azioni */}
                            <div className="flex items-center gap-1 shrink-0 mt-0.5">
                                <button
                                    type="button"
                                    title="Apri"
                                    onClick={() => setViewerIndice(documenti.indexOf(doc))}
                                    className="flex items-center justify-center rounded"
                                    style={{ width: '24px', height: '24px', color: 'var(--color-text-muted)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#60a5fa')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                    <EyeIcon />
                                </button>
                                <a href={`/documenti/${doc.id}/download`}
                                    title="Scarica"
                                    className="flex items-center justify-center rounded"
                                    style={{ width: '24px', height: '24px', color: 'var(--color-text-muted)' }}
                                    onMouseEnter={e => (e.currentTarget.style.color = '#34d399')}
                                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                    <DownloadIcon />
                                </a>
                                {doc.puo_inviare && (
                                    <button type="button"
                                        onClick={() => setInvioDocumento(doc)}
                                        title="Invia via email"
                                        className="flex items-center justify-center rounded"
                                        style={{ width: '24px', height: '24px', color: 'var(--color-text-muted)' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = '#a78bfa')}
                                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                        <InviaIcon />
                                    </button>
                                )}
                                {doc.puo_stampare && chioschiStampante.length > 0 && (
                                    <button type="button"
                                        onClick={() => setStampaDocumento(doc)}
                                        title="Stampa remota"
                                        className="flex items-center justify-center rounded"
                                        style={{ width: '24px', height: '24px', color: 'var(--color-text-muted)' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = '#7c3aed')}
                                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                        <StampaIcon />
                                    </button>
                                )}
                                {doc.puo_cancellare && (
                                    <button type="button"
                                        onClick={() => handleDelete(doc.id, doc.titolo)}
                                        title="Elimina"
                                        className="flex items-center justify-center rounded"
                                        style={{ width: '24px', height: '24px', color: 'var(--color-text-muted)' }}
                                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}>
                                        <TrashIcon />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                !puoUpload && (
                    <p className="text-xs mb-2" style={{ color: 'var(--color-text-muted)' }}>
                        Nessun documento allegato.
                    </p>
                )
            )}

            {/* Form upload */}
            {puoUpload && (
                <form onSubmit={handleUpload}
                    className={`space-y-2 ${documenti.length > 0 ? 'pt-4' : ''}`}
                    style={documenti.length > 0 ? { borderTop: '1px solid var(--color-border)' } : {}}>

                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>
                        {documenti.length === 0 ? 'Nessun documento — carica il primo:' : 'Carica documento'}
                    </p>

                    {/* Titolo */}
                    <input
                        type="text"
                        value={form.data.titolo}
                        onChange={e => form.setData('titolo', e.target.value)}
                        placeholder="Titolo (opzionale)"
                        className="w-full rounded px-3 py-1.5 text-xs outline-none"
                        style={{
                            backgroundColor: 'var(--color-bg-primary)',
                            border: '1px solid var(--color-border)',
                            color: 'var(--color-text-primary)',
                        }}
                        onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-parlato)')}
                        onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                    />

                    {/* Tipo documento + Lingua — riga */}
                    <div className="flex gap-2">
                        <select
                            value={form.data.tipo_documento}
                            onChange={e => form.setData('tipo_documento', e.target.value)}
                            className="flex-1 rounded px-2 py-1.5 text-xs outline-none"
                            style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border)',
                                color: form.data.tipo_documento ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            }}>
                            {TIPO_DOCUMENTO_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>

                        <select
                            value={form.data.lingua}
                            onChange={e => form.setData('lingua', e.target.value)}
                            className="w-32 rounded px-2 py-1.5 text-xs outline-none shrink-0"
                            style={{
                                backgroundColor: 'var(--color-bg-primary)',
                                border: '1px solid var(--color-border)',
                                color: form.data.lingua ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                            }}>
                            {LINGUA_OPTIONS.map(o => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                    </div>

                    {/* File + submit */}
                    <div className="flex items-center gap-2">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg"
                            onChange={e => form.setData('file', e.target.files?.[0] ?? null)}
                            className="flex-1 text-xs"
                            style={{ color: 'var(--color-text-muted)' }}
                        />
                        <button type="submit"
                            disabled={form.processing || !form.data.file}
                            className="px-3 py-1.5 rounded text-xs font-medium shrink-0"
                            style={{
                                backgroundColor: 'var(--color-parlato)',
                                color: '#fff',
                                opacity: (form.processing || !form.data.file) ? 0.5 : 1,
                                cursor: !form.data.file ? 'not-allowed' : 'pointer',
                            }}>
                            {form.processing ? 'Caricamento…' : 'Carica'}
                        </button>
                    </div>

                    {form.errors.file && (
                        <p className="text-xs" style={{ color: '#ef4444' }}>{form.errors.file}</p>
                    )}

                    <p className="text-xs" style={{ color: 'var(--color-text-muted)', opacity: 0.6 }}>
                        Formati consentiti: PDF, PNG, JPG · Max 20 MB
                    </p>
                </form>
            )}
        </div>
        </>
    );
}

// ── Icone ─────────────────────────────────────────────────────────────────────

function EyeIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
        </svg>
    );
}

function DownloadIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
    );
}

function TrashIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>
            <path d="M10 11v6M14 11v6"/>
            <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
        </svg>
    );
}

function InviaIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
        </svg>
    );
}

function StampaIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="6 9 6 2 18 2 18 9"/>
            <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
            <rect x="6" y="14" width="12" height="8"/>
        </svg>
    );
}
