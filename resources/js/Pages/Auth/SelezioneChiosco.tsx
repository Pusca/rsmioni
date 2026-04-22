import { FormEvent } from 'react';
import { useForm, Head } from '@inertiajs/react';
import GuestLayout from '@/Layouts/GuestLayout';
import { Chiosco } from '@/types';

interface Props {
    chioschi: Chiosco[];
    errors?: { chiosco_id?: string };
}

export default function SelezioneChiosco({ chioschi, errors }: Props) {
    const { data, setData, post, processing } = useForm({
        chiosco_id: '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post('/kiosk/seleziona');
    };

    return (
        <GuestLayout>
            <Head title="Seleziona Chiosco" />

            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">
                    RS <span style={{ color: 'var(--color-parlato)' }}>Mioni</span>
                </h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Seleziona il chiosco da associare a questa installazione
                </p>
            </div>

            <form onSubmit={handleSubmit}
                  className="rounded-xl border p-8 space-y-5"
                  style={{
                      backgroundColor: 'var(--color-bg-card)',
                      borderColor: 'var(--color-border)',
                  }}>

                <div className="space-y-2">
                    {chioschi.map((chiosco) => (
                        <label key={chiosco.id}
                               className="flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer border transition-colors"
                               style={{
                                   backgroundColor: data.chiosco_id === chiosco.id
                                       ? 'var(--color-bg-hover)'
                                       : 'var(--color-bg-secondary)',
                                   borderColor: data.chiosco_id === chiosco.id
                                       ? 'var(--color-parlato)'
                                       : 'var(--color-border)',
                               }}>
                            <input
                                type="radio"
                                name="chiosco_id"
                                value={chiosco.id}
                                checked={data.chiosco_id === chiosco.id}
                                onChange={() => setData('chiosco_id', chiosco.id)}
                                className="accent-blue-500"
                            />
                            <div>
                                <div className="text-sm font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                    {chiosco.nome}
                                </div>
                                <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {chiosco.tipo} — {chiosco.interattivo ? 'Interattivo' : 'Solo visione'}
                                </div>
                            </div>
                        </label>
                    ))}
                </div>

                {errors?.chiosco_id && (
                    <p className="text-xs" style={{ color: '#ef4444' }}>{errors.chiosco_id}</p>
                )}

                <button
                    type="submit"
                    disabled={processing || !data.chiosco_id}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-opacity disabled:opacity-40"
                    style={{ backgroundColor: 'var(--color-parlato)', color: '#fff' }}>
                    {processing ? 'Configurazione...' : 'Continua'}
                </button>
            </form>
        </GuestLayout>
    );
}
