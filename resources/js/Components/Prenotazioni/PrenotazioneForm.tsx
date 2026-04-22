import { useForm } from '@inertiajs/react';
import { FormEvent } from 'react';
import { HotelConfig, TipoPagamento, StatoDocumentoIdentita, Prenotazione, Profilo } from '@/types';

// ── Tipi locali ───────────────────────────────────────────────────────────────

export interface FormValues {
    hotel_id: string;
    codice: string;
    nome: string;
    cognome: string;
    gruppo: string;
    check_in: string;
    check_out: string;
    pax_adulti: string;
    pax_ragazzi: string;
    pax_bambini: string;
    tipo_pagamento: TipoPagamento | '';
    documento_identita: StatoDocumentoIdentita | '';
    prezzo: string;
    overbooking: boolean;
    checkin_confermato?: boolean;
}

interface Props {
    hotels: HotelConfig[];
    profilo: Profilo;
    oggi: string;
    prenotazione?: Prenotazione & { hotel?: { id: string; nome: string } };
    onSubmit: (form: ReturnType<typeof useForm<FormValues>>) => void;
    submitLabel: string;
    isEdit?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildDefaults(prenotazione?: Props['prenotazione'], hotels?: HotelConfig[]): FormValues {
    if (prenotazione) {
        return {
            hotel_id:           prenotazione.hotel_id,
            codice:             prenotazione.codice ?? '',
            nome:               prenotazione.nome ?? '',
            cognome:            prenotazione.cognome ?? '',
            gruppo:             prenotazione.gruppo ?? '',
            check_in:           prenotazione.check_in,
            check_out:          prenotazione.check_out ?? '',
            pax_adulti:         String(prenotazione.pax?.adulti ?? 1),
            pax_ragazzi:        String(prenotazione.pax?.ragazzi ?? 0),
            pax_bambini:        String(prenotazione.pax?.bambini ?? 0),
            tipo_pagamento:     prenotazione.tipo_pagamento,
            documento_identita: prenotazione.documento_identita,
            prezzo:             prenotazione.prezzo != null ? String(prenotazione.prezzo) : '',
            overbooking:        prenotazione.overbooking,
            checkin_confermato: prenotazione.checkin_confermato,
        };
    }
    return {
        hotel_id:           hotels?.[0]?.id ?? '',
        codice:             '',
        nome:               '',
        cognome:            '',
        gruppo:             '',
        check_in:           '',
        check_out:          '',
        pax_adulti:         '1',
        pax_ragazzi:        '0',
        pax_bambini:        '0',
        tipo_pagamento:     '',
        documento_identita: '',
        prezzo:             '',
        overbooking:        false,
    };
}

// ── Componente ────────────────────────────────────────────────────────────────

export default function PrenotazioneForm({ hotels, profilo, oggi, prenotazione, onSubmit, submitLabel, isEdit = false }: Props) {
    const form = useForm<FormValues>(buildDefaults(prenotazione, hotels));
    const { data, setData, processing } = form;
    // Il server restituisce errori con chiavi dot-notation (pax.adulti) che non compaiono
    // nel tipo FormValues — usiamo un cast esplicito per accedervi senza errori TypeScript.
    const errors = form.errors as Record<string, string | undefined>;

    const hotelSelezionato = hotels.find(h => h.id === data.hotel_id);
    const isGestore        = profilo === 'gestore_hotel';

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        onSubmit(form);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            {/* ── Hotel ── (solo se più di uno o è gestore) */}
            {hotels.length > 1 && (
                <FormSection label="Hotel">
                    <SelectField
                        value={data.hotel_id}
                        onChange={v => setData('hotel_id', v)}
                        error={errors.hotel_id}
                        options={hotels.map(h => ({ value: h.id, label: h.nome }))}
                    />
                </FormSection>
            )}

            {/* ── Identificativi ── */}
            <FormSection label="Identificativi">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <FieldLabel>Codice prenotazione</FieldLabel>
                        <Input
                            value={data.codice}
                            onChange={v => setData('codice', v)}
                            placeholder="es. BKG-001"
                            error={errors.codice}
                        />
                    </div>
                    <div>
                        {/* spacer */}
                    </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <FieldLabel>Nome</FieldLabel>
                        <Input value={data.nome} onChange={v => setData('nome', v)} error={errors.nome} />
                    </div>
                    <div>
                        <FieldLabel>Cognome</FieldLabel>
                        <Input value={data.cognome} onChange={v => setData('cognome', v)} error={errors.cognome} />
                    </div>
                    <div>
                        <FieldLabel>Gruppo</FieldLabel>
                        <Input value={data.gruppo} onChange={v => setData('gruppo', v)} placeholder="es. Gruppo Tour" error={errors.gruppo} />
                    </div>
                </div>
            </FormSection>

            {/* ── Date ── */}
            <FormSection label="Date soggiorno">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <FieldLabel required>Check-in</FieldLabel>
                        <Input type="date" value={data.check_in} onChange={v => setData('check_in', v)} error={errors.check_in} />
                    </div>
                    <div>
                        <FieldLabel required>Check-out</FieldLabel>
                        <Input type="date" value={data.check_out} onChange={v => setData('check_out', v)} min={data.check_in || oggi} error={errors.check_out} />
                    </div>
                </div>
            </FormSection>

            {/* ── PAX ── */}
            <FormSection label="Ospiti">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <FieldLabel required>Adulti</FieldLabel>
                        <Input type="number" min="1" max="99" value={data.pax_adulti} onChange={v => setData('pax_adulti', v)} error={errors['pax.adulti']} />
                    </div>
                    <div>
                        <FieldLabel>Ragazzi</FieldLabel>
                        <Input type="number" min="0" max="99" value={data.pax_ragazzi} onChange={v => setData('pax_ragazzi', v)} error={errors['pax.ragazzi']} />
                    </div>
                    <div>
                        <FieldLabel>Bambini</FieldLabel>
                        <Input type="number" min="0" max="99" value={data.pax_bambini} onChange={v => setData('pax_bambini', v)} error={errors['pax.bambini']} />
                    </div>
                </div>
            </FormSection>

            {/* ── Pagamento e documento ── */}
            <FormSection label="Pagamento e documento">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <FieldLabel required>Stato pagamento</FieldLabel>
                        <SelectField
                            value={data.tipo_pagamento}
                            onChange={v => setData('tipo_pagamento', v as TipoPagamento)}
                            error={errors.tipo_pagamento}
                            placeholder="Seleziona..."
                            options={[
                                { value: 'gia_pagato', label: 'Già pagato' },
                                { value: 'da_pagare',  label: 'Da pagare' },
                            ]}
                        />
                    </div>
                    <div>
                        <FieldLabel required>Documento identità</FieldLabel>
                        <SelectField
                            value={data.documento_identita}
                            onChange={v => setData('documento_identita', v as StatoDocumentoIdentita)}
                            error={errors.documento_identita}
                            placeholder="Seleziona..."
                            options={[
                                { value: 'gia_fornito',  label: 'Già fornito' },
                                { value: 'da_acquisire', label: 'Da acquisire' },
                            ]}
                        />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                    <div>
                        <FieldLabel>Prezzo totale (€)</FieldLabel>
                        <Input type="number" min="0" step="0.01" value={data.prezzo} onChange={v => setData('prezzo', v)} placeholder="0.00" error={errors.prezzo} />
                    </div>
                </div>
            </FormSection>

            {/* ── Overbooking ── */}
            {hotelSelezionato?.overbooking_permesso && (
                <FormSection label="Opzioni avanzate">
                    <label className="flex items-center gap-3 cursor-pointer select-none" style={{ color: 'var(--color-text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={data.overbooking}
                            onChange={e => setData('overbooking', e.target.checked)}
                            className="w-4 h-4 rounded"
                            style={{ accentColor: '#f59e0b' }}
                        />
                        <span className="text-sm">
                            Segna come <strong style={{ color: '#f59e0b' }}>overbooking</strong>
                        </span>
                    </label>
                    {errors.overbooking && <ErrorText>{errors.overbooking}</ErrorText>}
                </FormSection>
            )}

            {/* ── Check-in confermato (solo edit) ── */}
            {isEdit && (
                <FormSection label="Stato check-in">
                    <label className="flex items-center gap-3 cursor-pointer select-none" style={{ color: 'var(--color-text-secondary)' }}>
                        <input
                            type="checkbox"
                            checked={data.checkin_confermato ?? false}
                            onChange={e => setData('checkin_confermato', e.target.checked)}
                            className="w-4 h-4 rounded"
                            style={{ accentColor: '#22c55e' }}
                        />
                        <span className="text-sm">Check-in confermato</span>
                    </label>
                </FormSection>
            )}

            {/* ── Azioni ── */}
            <div className="flex items-center gap-3 pt-2">
                <button
                    type="submit"
                    disabled={processing}
                    className="px-5 py-2 rounded text-sm font-medium transition-opacity"
                    style={{
                        backgroundColor: 'var(--color-parlato)',
                        color:           '#fff',
                        opacity:         processing ? 0.6 : 1,
                    }}
                >
                    {processing ? 'Salvataggio…' : submitLabel}
                </button>
                <a
                    href={prenotazione ? `/prenotazioni/${prenotazione.id}` : '/prenotazioni'}
                    className="px-4 py-2 rounded text-sm transition-colors"
                    style={{ color: 'var(--color-text-muted)' }}
                    onClick={e => { e.preventDefault(); history.back(); }}
                >
                    Annulla
                </a>
            </div>
        </form>
    );
}

// ── Sotto-componenti interni ───────────────────────────────────────────────────

function FormSection({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div
            className="rounded-lg p-5"
            style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}
        >
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
                {label}
            </h3>
            {children}
        </div>
    );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {children}
            {required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}
        </label>
    );
}

function Input({
    value, onChange, type = 'text', placeholder, error, min, max, step,
}: {
    value: string;
    onChange: (v: string) => void;
    type?: string;
    placeholder?: string;
    error?: string;
    min?: string;
    max?: string;
    step?: string;
}) {
    return (
        <>
            <input
                type={type}
                value={value}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                min={min}
                max={max}
                step={step}
                className="w-full rounded px-3 py-2 text-sm outline-none transition-colors"
                style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    border:          `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
                    color:           'var(--color-text-primary)',
                }}
                onFocus={e => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--color-parlato)')}
                onBlur={e  => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--color-border)')}
            />
            {error && <ErrorText>{error}</ErrorText>}
        </>
    );
}

function SelectField({
    value, onChange, options, placeholder, error,
}: {
    value: string;
    onChange: (v: string) => void;
    options: { value: string; label: string }[];
    placeholder?: string;
    error?: string;
}) {
    return (
        <>
            <select
                value={value}
                onChange={e => onChange(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{
                    backgroundColor: 'var(--color-bg-primary)',
                    border:          `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
                    color:           value ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                }}
            >
                {placeholder && <option value="">{placeholder}</option>}
                {options.map(o => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                ))}
            </select>
            {error && <ErrorText>{error}</ErrorText>}
        </>
    );
}

function ErrorText({ children }: { children: React.ReactNode }) {
    return <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{children}</p>;
}
