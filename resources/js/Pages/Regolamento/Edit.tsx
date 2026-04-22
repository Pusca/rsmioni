import { Head, Link, useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import { CategoriaRegola } from '@/types';
import { regolaLabel } from './Index';

interface HotelOption { id: string; nome: string; lingue_abilitate: string[]; }

interface RegolaData {
    id: string;
    codice: string;
    categoria: CategoriaRegola;
    ordine: number;
}

interface Props {
    regola:       RegolaData;
    contenuti:    Record<string, string>;   // { it: "...", en: "" }
    lingue_hotel: string[];
    hotels:       HotelOption[];
    hotel_id:     string | null;
    profilo:      'gestore_hotel';
}

const LINGUA_LABEL: Record<string, string> = {
    it: 'Italiano',
    en: 'English',
    de: 'Deutsch',
    fr: 'Français',
    es: 'Español',
};

// FormValues: lingue_<cod> per ogni lingua (es. lingue_it, lingue_en)
// Questo approccio evita oggetti nested con useForm e rende il transform più semplice.
type FormValues = Record<string, string>;

function buildDefaults(contenuti: Record<string, string>): FormValues {
    const defaults: FormValues = {};
    for (const [lingua, testo] of Object.entries(contenuti)) {
        defaults[`lingue_${lingua}`] = testo ?? '';
    }
    return defaults;
}

export default function RegolamentoEdit({ regola, contenuti, lingue_hotel, hotels, hotel_id }: Props) {
    const [linguaAttiva, setLinguaAttiva] = useState(lingue_hotel[0] ?? 'it');

    const form = useForm<FormValues>(buildDefaults(contenuti));
    const { data, setData, processing } = form;
    const errors = form.errors as Record<string, string | undefined>;

    const backHref = `/regolamento/${regola.id}${hotel_id ? `?hotel_id=${hotel_id}` : ''}`;

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();

        // Costruisce l'oggetto lingue da inviare al server
        const lingue: Record<string, string> = {};
        for (const lingua of lingue_hotel) {
            lingue[lingua] = data[`lingue_${lingua}`] ?? '';
        }

        form.transform(() => ({
            hotel_id: hotel_id ?? hotels[0]?.id ?? '',
            lingue,
        }));

        form.put(`/regolamento/${regola.id}`, {
            onSuccess: () => {},
        });
    };

    return (
        <GestoreHotelLayout>
            <Head title={`Valorizza — ${regolaLabel(regola.codice)}`} />

            <div className="max-w-4xl mx-auto py-8 px-6">

                {/* ── Breadcrumb ── */}
                <div className="mb-6">
                    <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                        <Link href="/regolamento" className="hover:underline" style={{ color: 'var(--color-text-muted)' }}>Regolamento</Link>
                        <span>/</span>
                        <Link href={backHref} className="hover:underline" style={{ color: 'var(--color-text-muted)' }}>
                            {regolaLabel(regola.codice)}
                        </Link>
                        <span>/</span>
                        <span>Valorizza</span>
                    </div>
                    <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        {regolaLabel(regola.codice)}
                    </h1>
                    <p className="text-xs mt-0.5 font-mono" style={{ color: 'var(--color-text-muted)' }}>
                        {regola.codice}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">

                    {/* ── Tabs lingua ── */}
                    {lingue_hotel.length > 1 && (
                        <div className="flex gap-1">
                            {lingue_hotel.map(l => (
                                <button key={l} type="button"
                                    onClick={() => setLinguaAttiva(l)}
                                    className="px-3 py-1.5 rounded text-xs font-medium transition-colors"
                                    style={{
                                        backgroundColor: linguaAttiva === l ? 'rgba(255,255,255,0.08)' : 'transparent',
                                        color:           linguaAttiva === l ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                                        border:          `1px solid ${linguaAttiva === l ? 'var(--color-border)' : 'transparent'}`,
                                    }}>
                                    {LINGUA_LABEL[l] ?? l.toUpperCase()}
                                    {!data[`lingue_${l}`] && (
                                        <span className="ml-1.5 rounded px-1 font-mono"
                                            style={{ fontSize: '8px', color: '#64748b', backgroundColor: 'rgba(100,116,139,0.15)' }}>
                                            vuoto
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Textarea per lingua attiva ── */}
                    {lingue_hotel.map(l => (
                        <div key={l} style={{ display: l === linguaAttiva ? 'block' : 'none' }}>
                            <div className="rounded-lg p-5"
                                style={{ backgroundColor: 'var(--color-bg-secondary)', border: `1px solid ${errors[`lingue.${l}`] ? '#ef4444' : 'var(--color-border)'}` }}>
                                <label className="block text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                    Contenuto in {LINGUA_LABEL[l] ?? l.toUpperCase()}
                                </label>
                                <textarea
                                    value={data[`lingue_${l}`] ?? ''}
                                    onChange={e => setData(`lingue_${l}`, e.target.value)}
                                    rows={16}
                                    placeholder={`Inserisci il contenuto in ${LINGUA_LABEL[l] ?? l.toUpperCase()}…`}
                                    className="w-full rounded px-3 py-2.5 text-sm outline-none resize-y leading-relaxed"
                                    style={{
                                        backgroundColor: 'var(--color-bg-primary)',
                                        border:          '1px solid var(--color-border)',
                                        color:           'var(--color-text-primary)',
                                        fontFamily:      'inherit',
                                        minHeight:       '200px',
                                    }}
                                    onFocus={e => (e.currentTarget.style.borderColor = 'var(--color-parlato)')}
                                    onBlur={e  => (e.currentTarget.style.borderColor = 'var(--color-border)')}
                                />
                                {errors[`lingue.${l}`] && (
                                    <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{errors[`lingue.${l}`]}</p>
                                )}
                                {/* Contatore caratteri */}
                                <p className="text-xs mt-2 text-right" style={{ color: 'var(--color-text-muted)' }}>
                                    {(data[`lingue_${l}`] ?? '').length.toLocaleString('it-IT')} caratteri
                                </p>
                            </div>
                        </div>
                    ))}

                    {/* Avviso multilingua */}
                    {lingue_hotel.length > 1 && (
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                            Il salvataggio aggiorna tutte le lingue contemporaneamente.
                        </p>
                    )}

                    {/* ── Azioni ── */}
                    <div className="flex items-center gap-3 pt-2">
                        <button type="submit" disabled={processing}
                            className="px-5 py-2 rounded text-sm font-medium"
                            style={{ backgroundColor: 'var(--color-parlato)', color: '#fff', opacity: processing ? 0.6 : 1 }}>
                            {processing ? 'Salvataggio…' : 'Salva'}
                        </button>
                        <Link href={backHref}
                            className="px-4 py-2 rounded text-sm"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Annulla
                        </Link>
                    </div>
                </form>
            </div>
        </GestoreHotelLayout>
    );
}
