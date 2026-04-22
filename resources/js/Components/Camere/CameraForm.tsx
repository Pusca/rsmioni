import { useForm } from '@inertiajs/react';
import { FormEvent } from 'react';
import { Camera } from '@/types';

interface HotelOption { id: string; nome: string; }

interface FormValues {
    hotel_id: string;
    nome: string;
    tipo: string;
    piano: string;
    booking_consentito: boolean;
    letti_matrimoniali: string;
    letti_singoli: string;
    letti_aggiunti: string;
    divani_letto_singoli: string;
    divani_letto_matrimoniali: string;
    culle: string;
    doccia: boolean;
    vasca: boolean;
    minibar: boolean;
    minibar_pieno: boolean;
    aria_condizionata: boolean;
    quadro_elettrico: string;
    codice_chiave: string;
    mq: string;
}

interface Props {
    hotels: HotelOption[];
    camera?: Camera;
    submitLabel: string;
    isEdit?: boolean;
    onSubmit: (form: ReturnType<typeof useForm<FormValues>>) => void;
}

function buildDefaults(camera?: Camera, hotels?: HotelOption[]): FormValues {
    if (camera) {
        return {
            hotel_id:                 camera.hotel_id,
            nome:                     camera.nome,
            tipo:                     camera.tipo,
            piano:                    String(camera.piano),
            booking_consentito:       camera.booking_consentito,
            letti_matrimoniali:       String(camera.letti_matrimoniali),
            letti_singoli:            String(camera.letti_singoli),
            letti_aggiunti:           String(camera.letti_aggiunti),
            divani_letto_singoli:     String(camera.divani_letto_singoli),
            divani_letto_matrimoniali:String(camera.divani_letto_matrimoniali),
            culle:                    String(camera.culle),
            doccia:                   camera.doccia,
            vasca:                    camera.vasca,
            minibar:                  camera.minibar,
            minibar_pieno:            camera.minibar_pieno,
            aria_condizionata:        camera.aria_condizionata,
            quadro_elettrico:         camera.quadro_elettrico ?? '',
            codice_chiave:            camera.codice_chiave ?? '',
            mq:                       camera.mq != null ? String(camera.mq) : '',
        };
    }
    return {
        hotel_id: hotels?.[0]?.id ?? '',
        nome: '', tipo: 'Matrimoniale', piano: '1',
        booking_consentito: true,
        letti_matrimoniali: '1', letti_singoli: '0', letti_aggiunti: '0',
        divani_letto_singoli: '0', divani_letto_matrimoniali: '0', culle: '0',
        doccia: true, vasca: false, minibar: false, minibar_pieno: false, aria_condizionata: true,
        quadro_elettrico: '', codice_chiave: '', mq: '',
    };
}

const TIPI_CAMERA = ['Singola', 'Doppia uso singola', 'Matrimoniale', 'Matrimoniale Superior',
    'Tripla', 'Quadrupla', 'Family', 'Suite', 'Servizio', 'Altro'];

export default function CameraForm({ hotels, camera, submitLabel, isEdit = false, onSubmit }: Props) {
    const form = useForm<FormValues>(buildDefaults(camera, hotels));
    const { data, setData, processing } = form;
    const errors = form.errors as Record<string, string | undefined>;

    const handleSubmit = (e: FormEvent) => { e.preventDefault(); onSubmit(form); };

    return (
        <form onSubmit={handleSubmit} className="space-y-5">

            {/* ── Hotel ── */}
            {!isEdit && hotels.length > 1 && (
                <Section label="Hotel">
                    <Select value={data.hotel_id} onChange={v => setData('hotel_id', v)}
                        options={hotels.map(h => ({ value: h.id, label: h.nome }))}
                        error={errors.hotel_id} />
                </Section>
            )}

            {/* ── Identità ── */}
            <Section label="Identità camera">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <Label required>Nome / Numero</Label>
                        <Input value={data.nome} onChange={v => setData('nome', v)}
                            placeholder="es. 101" error={errors.nome} />
                    </div>
                    <div>
                        <Label required>Tipo</Label>
                        <Select value={data.tipo} onChange={v => setData('tipo', v)}
                            options={TIPI_CAMERA.map(t => ({ value: t, label: t }))}
                            error={errors.tipo} />
                    </div>
                    <div>
                        <Label required>Piano</Label>
                        <Input type="number" min="0" max="20" value={data.piano}
                            onChange={v => setData('piano', v)} error={errors.piano} />
                    </div>
                </div>
                <div className="mt-4 flex items-center gap-3">
                    <CheckBox
                        checked={data.booking_consentito}
                        onChange={v => setData('booking_consentito', v)}
                        label="Prenotabile (visibile nella selezione camere)"
                        accentColor="#22c55e"
                    />
                </div>
            </Section>

            {/* ── Composizione letti ── */}
            <Section label="Composizione letti">
                <div className="grid grid-cols-3 gap-4">
                    <NumField label="Matrimoniali" value={data.letti_matrimoniali} onChange={v => setData('letti_matrimoniali', v)} />
                    <NumField label="Singoli"      value={data.letti_singoli}      onChange={v => setData('letti_singoli', v)} />
                    <NumField label="Aggiunti"     value={data.letti_aggiunti}     onChange={v => setData('letti_aggiunti', v)} />
                    <NumField label="Divani sing." value={data.divani_letto_singoli}      onChange={v => setData('divani_letto_singoli', v)} />
                    <NumField label="Divani matr." value={data.divani_letto_matrimoniali} onChange={v => setData('divani_letto_matrimoniali', v)} />
                    <NumField label="Culle"        value={data.culle}              onChange={v => setData('culle', v)} />
                </div>
            </Section>

            {/* ── Dotazioni ── */}
            <Section label="Dotazioni">
                <div className="flex flex-wrap gap-5">
                    <CheckBox checked={data.doccia}          onChange={v => setData('doccia', v)}          label="Doccia" />
                    <CheckBox checked={data.vasca}           onChange={v => setData('vasca', v)}           label="Vasca" />
                    <CheckBox checked={data.minibar}         onChange={v => setData('minibar', v)}         label="Minibar" />
                    <CheckBox checked={data.minibar_pieno}   onChange={v => setData('minibar_pieno', v)}   label="Minibar pieno" />
                    <CheckBox checked={data.aria_condizionata} onChange={v => setData('aria_condizionata', v)} label="Aria condizionata" />
                </div>
            </Section>

            {/* ── Info aggiuntive ── */}
            <Section label="Info aggiuntive">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <Label>Codice chiave</Label>
                        <Input value={data.codice_chiave} onChange={v => setData('codice_chiave', v)}
                            placeholder="es. K-101" error={errors.codice_chiave} />
                    </div>
                    <div>
                        <Label>Superficie (mq)</Label>
                        <Input type="number" min="0" step="0.5" value={data.mq}
                            onChange={v => setData('mq', v)} placeholder="es. 28.5" error={errors.mq} />
                    </div>
                </div>
                <div className="mt-4">
                    <Label>Quadro elettrico</Label>
                    <Input value={data.quadro_elettrico} onChange={v => setData('quadro_elettrico', v)}
                        placeholder="es. Q1A - quadro principale" error={errors.quadro_elettrico} />
                </div>
            </Section>

            {/* ── Azioni ── */}
            <div className="flex items-center gap-3 pt-2">
                <button type="submit" disabled={processing}
                    className="px-5 py-2 rounded text-sm font-medium"
                    style={{ backgroundColor: 'var(--color-parlato)', color: '#fff', opacity: processing ? 0.6 : 1 }}>
                    {processing ? 'Salvataggio…' : submitLabel}
                </button>
                <button type="button" onClick={() => history.back()}
                    className="px-4 py-2 rounded text-sm"
                    style={{ color: 'var(--color-text-muted)' }}>
                    Annulla
                </button>
            </div>
        </form>
    );
}

// ── Sub-componenti ─────────────────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="rounded-lg p-5" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--color-text-muted)' }}>
                {label}
            </h3>
            {children}
        </div>
    );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
    return (
        <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            {children}{required && <span style={{ color: '#ef4444', marginLeft: '3px' }}>*</span>}
        </label>
    );
}

function Input({ value, onChange, type = 'text', placeholder, error, min, max, step }:
    { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; error?: string; min?: string; max?: string; step?: string }) {
    return (
        <>
            <input type={type} value={value} onChange={e => onChange(e.target.value)}
                placeholder={placeholder} min={min} max={max} step={step}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--color-bg-primary)', border: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`, color: 'var(--color-text-primary)' }}
                onFocus={e => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--color-parlato)')}
                onBlur={e  => (e.currentTarget.style.borderColor = error ? '#ef4444' : 'var(--color-border)')}
            />
            {error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{error}</p>}
        </>
    );
}

function Select({ value, onChange, options, error, placeholder }:
    { value: string; onChange: (v: string) => void; options: {value:string;label:string}[]; error?: string; placeholder?: string }) {
    return (
        <>
            <select value={value} onChange={e => onChange(e.target.value)}
                className="w-full rounded px-3 py-2 text-sm outline-none"
                style={{ backgroundColor: 'var(--color-bg-primary)', border: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`, color: 'var(--color-text-primary)' }}>
                {placeholder && <option value="">{placeholder}</option>}
                {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {error && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{error}</p>}
        </>
    );
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <Label>{label}</Label>
            <Input type="number" min="0" max="10" value={value} onChange={onChange} />
        </div>
    );
}

function CheckBox({ checked, onChange, label, accentColor = 'var(--color-parlato)' }:
    { checked: boolean; onChange: (v: boolean) => void; label: string; accentColor?: string }) {
    return (
        <label className="flex items-center gap-2 cursor-pointer select-none text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)}
                className="w-4 h-4 rounded" style={{ accentColor }} />
            {label}
        </label>
    );
}
