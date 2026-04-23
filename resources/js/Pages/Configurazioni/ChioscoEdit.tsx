import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';

interface ChioscoData {
    id:              string;
    hotel_id:        string;
    nome:            string;
    tipo:            string;
    attivo:          boolean;
    interattivo:     boolean;
    has_pos:         boolean;
    tipo_pos:        string | null;
    has_stampante:   boolean;
    ip_address:      string | null;
    path_input_pos:  string | null;
    path_output_pos: string | null;
    hotel:           { id: string; nome: string } | null;
}

interface HotelItem {
    id:   string;
    nome: string;
}

interface Props {
    chiosco: ChioscoData | null;
    hotels:  HotelItem[];
    mode:    'create' | 'edit';
}

export default function ChioscoEdit({ chiosco, hotels, mode }: Props) {
    const isEdit  = mode === 'edit';
    const titoloH1 = isEdit ? `Modifica: ${chiosco?.nome}` : 'Nuovo chiosco';

    const [form, setForm] = useState({
        hotel_id:        chiosco?.hotel_id        ?? (hotels[0]?.id ?? ''),
        nome:            chiosco?.nome             ?? '',
        tipo:            chiosco?.tipo             ?? 'touch',
        attivo:          chiosco?.attivo           ?? true,
        interattivo:     chiosco?.interattivo      ?? true,
        has_pos:         chiosco?.has_pos          ?? false,
        tipo_pos:        chiosco?.tipo_pos         ?? 'ingenico',
        has_stampante:   chiosco?.has_stampante    ?? false,
        ip_address:      chiosco?.ip_address       ?? '',
        path_input_pos:  chiosco?.path_input_pos   ?? '',
        path_output_pos: chiosco?.path_output_pos  ?? '',
    });
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [saving, setSaving] = useState(false);

    const set = (key: string, value: unknown) =>
        setForm(f => ({ ...f, [key]: value }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setErrors({});

        const payload = {
            ...form,
            // Se has_pos è false, backend resetterà tipo_pos e path
            tipo_pos:        form.has_pos ? form.tipo_pos  : null,
            path_input_pos:  form.has_pos ? form.path_input_pos  || null : null,
            path_output_pos: form.has_pos ? form.path_output_pos || null : null,
        };

        if (isEdit && chiosco) {
            router.put(`/configurazioni/chioschi/${chiosco.id}`, payload, {
                onError:  errs => { setErrors(errs); setSaving(false); },
                onFinish: () => setSaving(false),
            });
        } else {
            router.post('/configurazioni/chioschi', payload, {
                onError:  errs => { setErrors(errs); setSaving(false); },
                onFinish: () => setSaving(false),
            });
        }
    };

    return (
        <GestoreHotelLayout>
            <Head title={titoloH1} />

            <div className="max-w-2xl mx-auto py-8 px-6">

                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <Link href="/configurazioni/hotel" style={{ color: 'var(--color-text-muted)' }} className="hover:underline">Configurazioni</Link>
                            <span>/</span>
                            <Link href="/configurazioni/chioschi" style={{ color: 'var(--color-text-muted)' }} className="hover:underline">Chioschi</Link>
                            <span>/</span>
                            <span>{isEdit ? 'Modifica' : 'Nuovo'}</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            {titoloH1}
                        </h1>
                    </div>
                    <Link href="/configurazioni/chioschi"
                        className="px-3 py-1.5 rounded text-xs"
                        style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                        ← Torna alla lista
                    </Link>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">

                    {/* ── Informazioni generali ── */}
                    <Section title="Informazioni generali">

                        {/* Hotel — solo se multi-hotel */}
                        {hotels.length > 1 && (
                            <Field label="Hotel" error={errors.hotel_id} required>
                                <select value={form.hotel_id} onChange={e => set('hotel_id', e.target.value)}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                                    {hotels.map(h => (
                                        <option key={h.id} value={h.id}>{h.nome}</option>
                                    ))}
                                </select>
                            </Field>
                        )}

                        <Field label="Nome chiosco" error={errors.nome} required>
                            <TextInput value={form.nome} onChange={v => set('nome', v)} required />
                        </Field>

                        <div className="grid grid-cols-2 gap-4">
                            <Field label="Tipo" error={errors.tipo} required>
                                <select value={form.tipo} onChange={e => set('tipo', e.target.value)}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                                    <option value="touch">Touch (touchscreen)</option>
                                    <option value="analogico">Analogico (campanello fisico)</option>
                                </select>
                            </Field>
                            <Field label="Indirizzo IP (kiosk agent)" error={errors.ip_address}>
                                <TextInput value={form.ip_address} onChange={v => set('ip_address', v)}
                                    placeholder="192.168.1.101" />
                            </Field>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Toggle label="Chiosco attivo"
                                descrizione="Se disattivo, non riceve richieste dalla portineria."
                                value={form.attivo}
                                onChange={v => set('attivo', v)} />
                            <Toggle label="Modalità interattiva"
                                descrizione="Permette collegamento in chiaro e parlato."
                                value={form.interattivo}
                                onChange={v => set('interattivo', v)} />
                        </div>
                    </Section>

                    {/* ── POS ── */}
                    <Section title="Terminale POS">
                        <Toggle
                            label="POS remoto abilitato"
                            descrizione="Permette di richiedere pagamenti POS durante la sessione di parlato."
                            value={form.has_pos}
                            onChange={v => set('has_pos', v)}
                        />

                        {form.has_pos && (
                            <div className="space-y-4 mt-2 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                <Field label="Tipo POS" error={errors.tipo_pos}>
                                    <select value={form.tipo_pos ?? 'ingenico'} onChange={e => set('tipo_pos', e.target.value)}
                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                        style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                                        <option value="ingenico">Ingenico</option>
                                        <option value="mypos">MyPOS</option>
                                    </select>
                                </Field>
                                <div className="grid grid-cols-1 gap-4">
                                    <Field label="Path file input POS (es. SRINPF.TXT)" error={errors.path_input_pos}>
                                        <TextInput value={form.path_input_pos}
                                            onChange={v => set('path_input_pos', v)}
                                            placeholder="C:\ProgramData\RTSDoremiPos\SRINPF.TXT" />
                                    </Field>
                                    <Field label="Path file output POS (es. SROUTF.TXT)" error={errors.path_output_pos}>
                                        <TextInput value={form.path_output_pos}
                                            onChange={v => set('path_output_pos', v)}
                                            placeholder="C:\ProgramData\RTSDoremiPos\SROUTF.TXT" />
                                    </Field>
                                </div>
                                <div className="rounded-lg px-3 py-2 text-xs"
                                    style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)', color: 'var(--color-text-muted)' }}>
                                    I path POS vengono usati dal kiosk agent Windows per la comunicazione con il terminale hardware.
                                    Il browser non ha accesso diretto ai file locali.
                                </div>
                            </div>
                        )}
                    </Section>

                    {/* ── Stampante ── */}
                    <Section title="Stampante">
                        <Toggle
                            label="Stampante remota abilitata"
                            descrizione="Permette la stampa di documenti dal receptionist verso questo chiosco."
                            value={form.has_stampante}
                            onChange={v => set('has_stampante', v)}
                        />
                    </Section>

                    {/* Errori generici */}
                    {Object.keys(errors).length > 0 && (
                        <div className="rounded-lg px-4 py-3 text-sm"
                            style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444' }}>
                            Correggere i campi evidenziati prima di salvare.
                        </div>
                    )}

                    {/* Pulsanti */}
                    <div className="flex items-center justify-between pt-2">
                        <Link href="/configurazioni/chioschi"
                            className="px-4 py-2 rounded-lg text-sm"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            Annulla
                        </Link>
                        <button type="submit" disabled={saving}
                            className="px-6 py-2 rounded-lg text-sm font-medium"
                            style={{
                                backgroundColor: saving ? 'rgba(59,130,246,0.4)' : '#3b82f6',
                                color: '#fff', border: 'none',
                                cursor: saving ? 'default' : 'pointer',
                            }}>
                            {saving ? 'Salvataggio…' : (isEdit ? 'Salva modifiche' : 'Crea chiosco')}
                        </button>
                    </div>
                </form>
            </div>
        </GestoreHotelLayout>
    );
}

// ── Componenti interni ────────────────────────────────────────────────────────

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

function TextInput({ value, onChange, placeholder, required }: {
    value: string | null; onChange: (v: string) => void; placeholder?: string; required?: boolean;
}) {
    return (
        <input type="text" value={value ?? ''} onChange={e => onChange(e.target.value)}
            placeholder={placeholder} required={required}
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
