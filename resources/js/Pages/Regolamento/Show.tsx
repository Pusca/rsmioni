import { Head, Link } from '@inertiajs/react';
import { useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import SezioneDocumenti, { DocumentoItem } from '@/Components/Documenti/SezioneDocumenti';
import { CategoriaRegola, Profilo } from '@/types';
import { regolaLabel } from './Index';

interface RegolaData {
    id: string;
    codice: string;
    categoria: CategoriaRegola;
    ordine: number;
}

interface Props {
    regola:              RegolaData;
    contenuti:           Record<string, string | null>;
    lingue_hotel:        string[];
    hotel:               { id: string; nome: string } | null;
    hotel_id:            string | null;
    profilo:             Profilo;
    documenti:           DocumentoItem[];
    puoUploadDocumenti:  boolean;
    chioschi:            Array<{ id: string; nome: string; has_stampante: boolean }>;
}

const LINGUA_LABEL: Record<string, string> = {
    it: 'Italiano',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
};

const CATEGORIA_LABEL: Record<CategoriaRegola, string> = {
    generale:  'Generali Hotel',
    turistica: 'Turistiche',
    supporto:  'Supporto Cliente',
    sicurezza: 'Sicurezza / Emergenza',
};

export default function RegolamentoShow({ regola, contenuti, lingue_hotel, hotel, hotel_id, profilo, documenti, puoUploadDocumenti, chioschi }: Props) {
    const isGestore = profilo === 'gestore_hotel';
    const Layout    = isGestore ? GestoreHotelLayout : ReceptionistLayout;

    const [linguaAttiva, setLinguaAttiva] = useState(lingue_hotel[0] ?? 'it');
    const testo = contenuti[linguaAttiva];

    const backHref = `/regolamento${hotel_id ? `?hotel_id=${hotel_id}` : ''}`;
    const editHref = `/regolamento/${regola.id}/edit${hotel_id ? `?hotel_id=${hotel_id}` : ''}`;

    return (
        <Layout>
            <Head title={regolaLabel(regola.codice)} />

            <div className="max-w-4xl mx-auto py-8 px-6">

                {/* ── Breadcrumb ── */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <Link href={backHref} className="hover:underline" style={{ color: 'var(--color-text-muted)' }}>
                                Regolamento
                            </Link>
                            <span>/</span>
                            <span className="capitalize" style={{ color: 'var(--color-text-muted)' }}>
                                {CATEGORIA_LABEL[regola.categoria]}
                            </span>
                            <span>/</span>
                            <span>{regolaLabel(regola.codice)}</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {regolaLabel(regola.codice)}
                        </h1>
                        {hotel && (
                            <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                {hotel.nome}
                            </p>
                        )}
                    </div>

                    {isGestore && (
                        <Link href={editHref}
                            className="px-4 py-2 rounded text-sm font-medium"
                            style={{ backgroundColor: 'var(--color-parlato)', color: '#fff' }}>
                            Valorizza
                        </Link>
                    )}
                </div>

                <div className="grid grid-cols-3 gap-5">

                    {/* ── Contenuto principale ── */}
                    <div className="col-span-2 space-y-5">

                        {/* Tabs lingua */}
                        {lingue_hotel.length > 1 && (
                            <div className="flex gap-1">
                                {lingue_hotel.map(l => (
                                    <button key={l}
                                        onClick={() => setLinguaAttiva(l)}
                                        className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                        style={{
                                            backgroundColor: linguaAttiva === l ? 'rgba(255,255,255,0.08)' : 'transparent',
                                            color:           linguaAttiva === l ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                            border:          `1px solid ${linguaAttiva === l ? 'var(--color-border)' : 'transparent'}`,
                                        }}>
                                        {LINGUA_LABEL[l] ?? l.toUpperCase()}
                                        {!contenuti[l] && (
                                            <span className="ml-1.5 rounded px-1 font-mono"
                                                style={{ fontSize: '8px', color: '#64748b', backgroundColor: 'rgba(100,116,139,0.15)' }}>
                                                vuoto
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Testo regola */}
                        <div className="rounded-lg p-5"
                            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                            {testo ? (
                                <pre className="whitespace-pre-wrap text-sm leading-relaxed"
                                    style={{ color: 'var(--color-text-secondary)', fontFamily: 'inherit' }}>
                                    {testo}
                                </pre>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-8 text-center">
                                    <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                        Contenuto non ancora valorizzato
                                        {lingue_hotel.length > 1 && ` per ${LINGUA_LABEL[linguaAttiva] ?? linguaAttiva}`}.
                                    </p>
                                    {isGestore && (
                                        <Link href={editHref}
                                            className="mt-3 text-xs underline"
                                            style={{ color: 'var(--color-parlato)' }}>
                                            Aggiungi contenuto →
                                        </Link>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Documenti allegati */}
                        <SezioneDocumenti
                            contestoTipo="regola"
                            contestoId={regola.id}
                            documenti={documenti}
                            puoUpload={puoUploadDocumenti}
                            chioschi={chioschi}
                        />
                    </div>

                    {/* ── Sidebar ── */}
                    <div className="space-y-5">
                        <div className="rounded-lg p-5"
                            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Informazioni
                            </h3>
                            <dl className="space-y-3 text-sm">
                                <div>
                                    <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Categoria</dt>
                                    <dd className="mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                                        {CATEGORIA_LABEL[regola.categoria]}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Codice sistema</dt>
                                    <dd className="mt-0.5 font-mono text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        {regola.codice}
                                    </dd>
                                </div>
                                <div>
                                    <dt className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Lingue</dt>
                                    <dd className="mt-1 flex flex-wrap gap-1">
                                        {lingue_hotel.map(l => (
                                            <span key={l}
                                                className="rounded px-2 py-0.5 font-mono text-xs"
                                                style={{
                                                    color:           contenuti[l] ? '#22c55e' : '#64748b',
                                                    backgroundColor: contenuti[l] ? 'rgba(34,197,94,0.08)' : 'rgba(100,116,139,0.08)',
                                                    border:          `1px solid ${contenuti[l] ? 'rgba(34,197,94,0.25)' : 'rgba(100,116,139,0.25)'}`,
                                                }}>
                                                {l.toUpperCase()}
                                            </span>
                                        ))}
                                    </dd>
                                </div>
                            </dl>
                        </div>

                        <div className="rounded-lg p-5"
                            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                            <h3 className="text-xs font-semibold uppercase tracking-wider mb-3"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Azioni rapide
                            </h3>
                            <div className="space-y-2">
                                {isGestore && (
                                    <Link href={editHref}
                                        className="block w-full text-center text-xs py-2 rounded"
                                        style={{ color: 'var(--color-parlato)', backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)' }}>
                                        Valorizza regola
                                    </Link>
                                )}
                                <Link href={backHref}
                                    className="block w-full text-center text-xs py-2 rounded"
                                    style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid var(--color-border)' }}>
                                    Torna al regolamento
                                </Link>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Layout>
    );
}
