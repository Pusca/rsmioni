import { Head, router } from '@inertiajs/react';
import { useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import { Link } from '@inertiajs/react';

interface HotelData {
    id:                            string;
    nome:                          string;
    indirizzo:                     string | null;
    lingua_default:                string;
    lingue_abilitate:              string[] | null;
    giorni_visibilita_calendario:  number;
    overbooking_permesso:          boolean;
    chioschi_concorrenti_max:      number;
    checkout_libero:               boolean;
    checkout_ora:                  string | null;
    suoneria_attiva:               boolean;
    volume_suoneria:               number;
    numero_massimo_pax:            number;
    giorni_cancellazione_automatica: number | null;
}

interface Props {
    hotels:             HotelData[];
    lingue_disponibili: Record<string, string>;
}

export default function HotelConfig({ hotels, lingue_disponibili }: Props) {
    // In demo: un solo hotel. Se più, mostro tabs per hotel.
    const [hotelIdx, setHotelIdx] = useState(0);
    const hotel = hotels[hotelIdx];

    return (
        <GestoreHotelLayout>
            <Head title="Configurazioni Hotel" />
            <div className="max-w-3xl mx-auto py-8 px-6">

                {/* Breadcrumb + header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <span>Configurazioni</span>
                            <span>/</span>
                            <span>Hotel</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Configurazioni Hotel
                        </h1>
                    </div>
                </div>

                {/* Sub-nav configurazioni */}
                <ConfigSubNav active="hotel" />

                {/* Selector hotel (solo se multi-hotel) */}
                {hotels.length > 1 && (
                    <div className="flex gap-2 mb-5 flex-wrap">
                        {hotels.map((h, i) => (
                            <button key={h.id} onClick={() => setHotelIdx(i)}
                                className="px-3 py-1 rounded text-xs font-medium"
                                style={{
                                    backgroundColor: i === hotelIdx ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
                                    border:          `1px solid ${i === hotelIdx ? 'rgba(59,130,246,0.4)' : 'var(--color-border)'}`,
                                    color:           i === hotelIdx ? '#60a5fa' : 'var(--color-text-muted)',
                                }}>
                                {h.nome}
                            </button>
                        ))}
                    </div>
                )}

                {hotel && <HotelForm hotel={hotel} lingue_disponibili={lingue_disponibili} />}
            </div>
        </GestoreHotelLayout>
    );
}

// ── Form hotel ────────────────────────────────────────────────────────────────

function HotelForm({ hotel, lingue_disponibili }: { hotel: HotelData; lingue_disponibili: Record<string, string> }) {
    const [form, setForm] = useState({
        nome:                          hotel.nome,
        indirizzo:                     hotel.indirizzo ?? '',
        lingua_default:                hotel.lingua_default,
        lingue_abilitate:              hotel.lingue_abilitate ?? ['it'],
        giorni_visibilita_calendario:  hotel.giorni_visibilita_calendario,
        overbooking_permesso:          hotel.overbooking_permesso,
        chioschi_concorrenti_max:      hotel.chioschi_concorrenti_max,
        checkout_libero:               hotel.checkout_libero,
        checkout_ora:                  hotel.checkout_ora ?? '',
        suoneria_attiva:               hotel.suoneria_attiva,
        volume_suoneria:               hotel.volume_suoneria,
        numero_massimo_pax:            hotel.numero_massimo_pax,
        giorni_cancellazione_automatica: hotel.giorni_cancellazione_automatica ?? '',
    });
    const [errors,  setErrors]  = useState<Record<string, string>>({});
    const [saving,  setSaving]  = useState(false);

    const set = (key: string, value: unknown) =>
        setForm(f => ({ ...f, [key]: value }));

    const toggleLingua = (codice: string) => {
        set('lingue_abilitate',
            form.lingue_abilitate.includes(codice)
                ? form.lingue_abilitate.filter(l => l !== codice)
                : [...form.lingue_abilitate, codice]
        );
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});
        router.put(`/configurazioni/hotel/${hotel.id}`, form as never, {
            onError:  (errs) => { setErrors(errs); setSaving(false); },
            onFinish: () => setSaving(false),
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Generale ── */}
            <Section title="Generale">
                <Field label="Nome hotel" error={errors.nome} required>
                    <Input value={form.nome} onChange={v => set('nome', v)} required />
                </Field>
                <Field label="Indirizzo" error={errors.indirizzo}>
                    <Input value={form.indirizzo} onChange={v => set('indirizzo', v)} />
                </Field>
                <Field label="Lingua default" error={errors.lingua_default} required>
                    <select value={form.lingua_default} onChange={e => set('lingua_default', e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                        {Object.entries(lingue_disponibili).map(([codice, nome]) => (
                            <option key={codice} value={codice}>{nome} ({codice})</option>
                        ))}
                    </select>
                </Field>
                <Field label="Lingue abilitate sul chiosco" error={errors.lingue_abilitate}>
                    <div className="flex flex-wrap gap-2">
                        {Object.entries(lingue_disponibili).map(([codice, nome]) => {
                            const attiva = form.lingue_abilitate.includes(codice);
                            return (
                                <button key={codice} type="button" onClick={() => toggleLingua(codice)}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                                    style={{
                                        backgroundColor: attiva ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                                        border:          `1px solid ${attiva ? 'rgba(59,130,246,0.4)' : 'var(--color-border)'}`,
                                        color:           attiva ? '#60a5fa' : 'var(--color-text-muted)',
                                    }}>
                                    <span className="font-mono uppercase text-xs">{codice}</span>
                                    <span>{nome}</span>
                                </button>
                            );
                        })}
                    </div>
                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        La lingua default è inclusa automaticamente.
                    </p>
                </Field>
            </Section>

            {/* ── Prenotazioni ── */}
            <Section title="Prenotazioni">
                <div className="grid grid-cols-2 gap-4">
                    <Field label="Giorni visibilità calendario receptionist" error={errors.giorni_visibilita_calendario} required>
                        <NumberInput value={form.giorni_visibilita_calendario} onChange={v => set('giorni_visibilita_calendario', v)} min={1} max={365} />
                    </Field>
                    <Field label="Numero massimo ospiti per prenotazione" error={errors.numero_massimo_pax} required>
                        <NumberInput value={form.numero_massimo_pax} onChange={v => set('numero_massimo_pax', v)} min={1} max={20} />
                    </Field>
                    <Field label="Chioschi concorrenti massimi" error={errors.chioschi_concorrenti_max} required>
                        <NumberInput value={form.chioschi_concorrenti_max} onChange={v => set('chioschi_concorrenti_max', v)} min={1} max={10} />
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            Collegamento in chiaro + nascosto + parlato ≤ questo valore
                        </p>
                    </Field>
                    <Field label="Cancellazione automatica dopo check-out (giorni)" error={errors.giorni_cancellazione_automatica}>
                        <NumberInput value={form.giorni_cancellazione_automatica === '' ? '' : Number(form.giorni_cancellazione_automatica)} onChange={v => set('giorni_cancellazione_automatica', v)} min={1} max={365} />
                        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Lasciare vuoto per disabilitare.</p>
                    </Field>
                </div>
                <Toggle
                    label="Overbooking consentito"
                    descrizione="Permette di assegnare la stessa camera a più prenotazioni nello stesso periodo."
                    value={form.overbooking_permesso}
                    onChange={v => set('overbooking_permesso', v)}
                />
            </Section>

            {/* ── Checkout ── */}
            <Section title="Checkout">
                <Toggle
                    label="Checkout libero (nessuna ora fissa)"
                    value={form.checkout_libero}
                    onChange={v => set('checkout_libero', v)}
                />
                {!form.checkout_libero && (
                    <Field label="Ora di checkout" error={errors.checkout_ora} required>
                        <input type="time" value={form.checkout_ora}
                            onChange={e => set('checkout_ora', e.target.value)}
                            className="rounded-lg px-3 py-2 text-sm"
                            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }} />
                    </Field>
                )}
            </Section>

            {/* ── Audio ── */}
            <Section title="Audio chiosco">
                <Toggle
                    label="Suoneria di chiamata attiva"
                    descrizione="Abilita la suoneria quando il guest preme il pulsante di chiamata sul chiosco."
                    value={form.suoneria_attiva}
                    onChange={v => set('suoneria_attiva', v)}
                />
                {form.suoneria_attiva && (
                    <Field label={`Volume suoneria: ${form.volume_suoneria}%`} error={errors.volume_suoneria}>
                        <input type="range" min={0} max={100} step={5}
                            value={form.volume_suoneria}
                            onChange={e => set('volume_suoneria', Number(e.target.value))}
                            className="w-full" style={{ accentColor: '#3b82f6' }} />
                        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            <span>0%</span><span>50%</span><span>100%</span>
                        </div>
                    </Field>
                )}
            </Section>

            {/* Salva */}
            <div className="flex justify-end pt-2">
                <button type="submit" disabled={saving}
                    className="px-6 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                        backgroundColor: saving ? 'rgba(59,130,246,0.4)' : '#3b82f6',
                        color: '#fff', border: 'none',
                        cursor: saving ? 'default' : 'pointer',
                    }}>
                    {saving ? 'Salvataggio…' : 'Salva configurazioni'}
                </button>
            </div>
        </form>
    );
}

// ── Sub-nav configurazioni ────────────────────────────────────────────────────

function ConfigSubNav({ active }: { active: 'hotel' | 'chioschi' }) {
    return (
        <div className="flex gap-1 mb-6 border-b pb-0" style={{ borderColor: 'var(--color-border)' }}>
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

// ── Componenti form ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl p-5 space-y-4"
            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider"
                style={{ color: 'var(--color-text-muted)' }}>
                {title}
            </h3>
            {children}
        </div>
    );
}

function Field({ label, children, error, required }: {
    label: string; children: React.ReactNode; error?: string; required?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                {label}{required && <span className="ml-0.5" style={{ color: '#ef4444' }}>*</span>}
            </label>
            {children}
            {error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{error}</p>}
        </div>
    );
}

function Input({ value, onChange, required }: {
    value: string; onChange: (v: string) => void; required?: boolean;
}) {
    return (
        <input type="text" value={value} onChange={e => onChange(e.target.value)}
            required={required}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
    );
}

function NumberInput({ value, onChange, min, max }: {
    value: number | string; onChange: (v: number | string) => void; min?: number; max?: number;
}) {
    return (
        <input type="number" value={value}
            onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
            min={min} max={max}
            className="w-full rounded-lg px-3 py-2 text-sm"
            style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
        />
    );
}

function Toggle({ label, descrizione, value, onChange }: {
    label: string; descrizione?: string; value: boolean; onChange: (v: boolean) => void;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>{label}</p>
                {descrizione && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>{descrizione}</p>
                )}
            </div>
            <button type="button" onClick={() => onChange(!value)}
                className="shrink-0 rounded-full transition-colors"
                style={{
                    width: 40, height: 22,
                    backgroundColor: value ? '#3b82f6' : 'rgba(255,255,255,0.1)',
                    border: '1px solid rgba(255,255,255,0.15)',
                    position: 'relative',
                }}>
                <span className="absolute top-0.5 transition-all rounded-full"
                    style={{
                        width: 16, height: 16,
                        backgroundColor: '#fff',
                        left: value ? 20 : 2,
                    }} />
            </button>
        </div>
    );
}
