import { FormEvent } from 'react';
import { Head, useForm, usePage } from '@inertiajs/react';
import { SharedProps } from '@/types';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';

/**
 * Cambio password — Receptionist, Receptionist Lite, Gestore hotel.
 * Il layout segue il profilo dell'utente (come Regolamento).
 */
export default function CambioPassword() {
    const page    = usePage<SharedProps>();
    const profilo = page.props.auth.utente?.profilo;
    const Layout  = profilo === 'gestore_hotel' ? GestoreHotelLayout : ReceptionistLayout;

    const { data, setData, put, processing, errors, reset } = useForm({
        password_attuale:      '',
        password:              '',
        password_confirmation: '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        put('/password', { onSuccess: () => reset() });
    };

    return (
        <Layout>
            <Head title="Cambio password" />

            <div className="max-w-md mx-auto p-6">
                <h1 className="text-lg font-semibold mb-1" style={{ color: 'var(--color-text-primary)' }}>
                    Cambio password
                </h1>
                <p className="text-sm mb-6" style={{ color: 'var(--color-text-muted)' }}>
                    Almeno 10 caratteri, con maiuscole, minuscole e numeri.
                </p>

                <form onSubmit={handleSubmit}
                      className="rounded-xl border p-6 space-y-4"
                      style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>

                    <Campo label="Password attuale" error={errors.password_attuale}
                           value={data.password_attuale} autoComplete="current-password"
                           onChange={(v) => setData('password_attuale', v)} />

                    <Campo label="Nuova password" error={errors.password}
                           value={data.password} autoComplete="new-password"
                           onChange={(v) => setData('password', v)} />

                    <Campo label="Ripeti la nuova password" error={errors.password_confirmation}
                           value={data.password_confirmation} autoComplete="new-password"
                           onChange={(v) => setData('password_confirmation', v)} />

                    <button type="submit" disabled={processing}
                            className="w-full py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-opacity disabled:opacity-60"
                            style={{ backgroundColor: 'var(--color-parlato)', color: '#fff' }}>
                        {processing ? 'Salvataggio…' : 'AGGIORNA PASSWORD'}
                    </button>
                </form>
            </div>
        </Layout>
    );
}

function Campo({ label, value, onChange, error, autoComplete }: {
    label: string; value: string; onChange: (v: string) => void; error?: string; autoComplete: string;
}) {
    return (
        <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--color-text-secondary)' }}>{label}</label>
            <input type="password" value={value} onChange={(e) => onChange(e.target.value)}
                   autoComplete={autoComplete}
                   className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                   style={{
                       backgroundColor: 'var(--color-bg-secondary)',
                       border: `1px solid ${error ? '#ef4444' : 'var(--color-border)'}`,
                       color: 'var(--color-text-primary)',
                   }} />
            {error && <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{error}</p>}
        </div>
    );
}
