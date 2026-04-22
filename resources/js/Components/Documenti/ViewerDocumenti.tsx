import { useEffect, useState } from 'react';
import { DocumentoItem } from './SezioneDocumenti';

interface Props {
    documenti:       DocumentoItem[];
    indiceIniziale?: number;
    onClose:         () => void;
}

const PROFILO_LABEL: Record<string, string> = {
    gestore_hotel:    'Gestore',
    receptionist:     'Receptionist',
    receptionist_lite:'R. Lite',
    chiosco:          'Chiosco',
};

const TIPO_LABEL: Record<string, string> = {
    carta_identita: 'Documento identità',
    passaporto:     'Passaporto',
    patente:        'Patente',
    planimetria:    'Planimetria',
    foto:           'Fotografia',
    contratto:      'Contratto',
    normativa:      'Normativa',
    allegato:       'Allegato',
    modulo:         'Modulo',
    altro:          'Altro',
};

const LINGUA_LABEL: Record<string, string> = {
    it: 'Italiano', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español',
};

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat('it-IT', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(new Date(iso));
}

function isImmagine(doc: DocumentoItem): boolean {
    return ['png', 'jpg', 'jpeg'].includes(doc.estensione);
}

export default function ViewerDocumenti({ documenti, indiceIniziale = 0, onClose }: Props) {
    const [indice, setIndice] = useState(
        Math.max(0, Math.min(indiceIniziale, documenti.length - 1))
    );
    const [zoom, setZoom] = useState(false);
    const [imgError, setImgError] = useState(false);

    const doc = documenti[indice];

    // Reset img error quando si naviga
    useEffect(() => { setImgError(false); setZoom(false); }, [indice]);

    // Chiusura con ESC, navigazione con frecce
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === 'ArrowRight' && indice < documenti.length - 1) setIndice(i => i + 1);
            if (e.key === 'ArrowLeft'  && indice > 0)                    setIndice(i => i - 1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [indice, documenti.length, onClose]);

    if (!doc) return null;

    const src = `/documenti/${doc.id}`;

    return (
        /* Overlay */
        <div
            className="fixed inset-0 z-50 flex flex-col"
            style={{ backgroundColor: 'rgba(0,0,0,0.92)' }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            {/* ── Barra superiore ── */}
            <div className="shrink-0 flex items-center justify-between px-5 py-3"
                style={{ backgroundColor: '#0a0c12', borderBottom: '1px solid #1a1d27' }}>

                <div className="flex items-center gap-3">
                    {/* Navigazione */}
                    {documenti.length > 1 && (
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => setIndice(i => Math.max(0, i - 1))}
                                disabled={indice === 0}
                                className="flex items-center justify-center rounded px-2 py-1 text-xs"
                                style={{
                                    color:  indice === 0 ? '#3a3f55' : 'var(--color-text-muted)',
                                    cursor: indice === 0 ? 'not-allowed' : 'pointer',
                                }}>
                                ‹ Prec
                            </button>
                            <span className="text-xs px-2" style={{ color: 'var(--color-text-muted)' }}>
                                {indice + 1} / {documenti.length}
                            </span>
                            <button
                                onClick={() => setIndice(i => Math.min(documenti.length - 1, i + 1))}
                                disabled={indice === documenti.length - 1}
                                className="flex items-center justify-center rounded px-2 py-1 text-xs"
                                style={{
                                    color:  indice === documenti.length - 1 ? '#3a3f55' : 'var(--color-text-muted)',
                                    cursor: indice === documenti.length - 1 ? 'not-allowed' : 'pointer',
                                }}>
                                Succ ›
                            </button>
                        </div>
                    )}

                    {/* Titolo documento */}
                    <span className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                        {doc.titolo ?? 'Senza titolo'}
                        <span className="ml-1.5 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            .{doc.estensione}
                        </span>
                    </span>

                    {/* Badge metadati */}
                    {doc.tipo_documento && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-mono"
                            style={{ color: '#a78bfa', backgroundColor: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.2)' }}>
                            {TIPO_LABEL[doc.tipo_documento] ?? doc.tipo_documento}
                        </span>
                    )}
                    {doc.lingua && (
                        <span className="rounded px-1.5 py-0.5 text-xs font-mono"
                            style={{ color: '#34d399', backgroundColor: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.2)' }}>
                            {LINGUA_LABEL[doc.lingua] ?? doc.lingua.toUpperCase()}
                        </span>
                    )}
                </div>

                {/* Azioni + chiudi */}
                <div className="flex items-center gap-2">
                    {isImmagine(doc) && (
                        <button
                            onClick={() => setZoom(z => !z)}
                            className="rounded px-3 py-1.5 text-xs"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                            title={zoom ? 'Riduci' : 'Ingrandisci'}>
                            {zoom ? '⊟ Riduci' : '⊞ Ingrandisci'}
                        </button>
                    )}
                    <a
                        href={`/documenti/${doc.id}/download`}
                        className="rounded px-3 py-1.5 text-xs"
                        style={{ color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }}>
                        Scarica
                    </a>
                    <button
                        onClick={onClose}
                        className="rounded px-3 py-1.5 text-xs font-medium"
                        style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                        Chiudi ✕
                    </button>
                </div>
            </div>

            {/* ── Corpo: anteprima documento ── */}
            <div className="flex-1 min-h-0 flex items-center justify-center p-4 overflow-auto">
                {isImmagine(doc) ? (
                    imgError ? (
                        <div className="text-center" style={{ color: '#5c6380' }}>
                            <p className="text-sm">Impossibile caricare l'immagine.</p>
                            <a href={src} target="_blank" rel="noreferrer"
                                className="text-xs underline mt-2 block" style={{ color: 'var(--color-parlato)' }}>
                                Apri in nuova scheda →
                            </a>
                        </div>
                    ) : (
                        <img
                            src={src}
                            alt={doc.titolo ?? 'Documento'}
                            onError={() => setImgError(true)}
                            onClick={() => setZoom(z => !z)}
                            style={{
                                maxWidth:  zoom ? 'none'    : '100%',
                                maxHeight: zoom ? 'none'    : '100%',
                                width:     zoom ? 'auto'    : 'auto',
                                objectFit: 'contain',
                                cursor:    'zoom-in',
                                borderRadius: '4px',
                                boxShadow: '0 4px 32px rgba(0,0,0,0.6)',
                            }}
                        />
                    )
                ) : (
                    /* PDF */
                    <iframe
                        src={src}
                        title={doc.titolo ?? 'Documento PDF'}
                        style={{
                            width:        '100%',
                            height:       '100%',
                            border:       'none',
                            borderRadius: '4px',
                        }}
                    />
                )}
            </div>

            {/* ── Barra inferiore: metadati ── */}
            <div className="shrink-0 flex items-center justify-between px-5 py-2"
                style={{ backgroundColor: '#0a0c12', borderTop: '1px solid #1a1d27' }}>
                <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    <span>Caricato da: {PROFILO_LABEL[doc.inserito_da_profilo] ?? doc.inserito_da_profilo}</span>
                    <span>·</span>
                    <span>{formatDate(doc.created_at)}</span>
                </div>
                {documenti.length > 1 && (
                    <p className="text-xs" style={{ color: '#3a3f55' }}>
                        ← → per navigare · ESC per chiudere
                    </p>
                )}
            </div>
        </div>
    );
}
