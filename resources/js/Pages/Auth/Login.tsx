import { FormEvent, useState } from 'react';
import { useForm, Head } from '@inertiajs/react';
import GuestLayout from '@/Layouts/GuestLayout';

interface Props {
    errors?: { username?: string; password?: string; generale?: string };
}

export default function Login({ errors }: Props) {
    const { data, setData, post, processing } = useForm({
        username: '',
        password: '',
    });

    const handleSubmit = (e: FormEvent) => {
        e.preventDefault();
        post('/login');
    };

    return (
        <GuestLayout>
            <Head title="Accedi" />

            <div className="text-center mb-8">
                <h1 className="text-3xl font-bold text-white tracking-tight">
                    RS <span style={{ color: 'var(--color-parlato)' }}>Mioni</span>
                </h1>
                <p className="mt-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
                    Smart Reception Service
                </p>
            </div>

            <form onSubmit={handleSubmit}
                  className="rounded-xl border p-8 space-y-5"
                  style={{
                      backgroundColor: 'var(--color-bg-card)',
                      borderColor: 'var(--color-border)',
                  }}>

                {/* Errore generale */}
                {errors?.generale && (
                    <div className="text-sm px-3 py-2 rounded"
                         style={{ backgroundColor: '#3b0d0d', color: '#f87171', border: '1px solid #7f1d1d' }}>
                        {errors.generale}
                    </div>
                )}

                {/* Username */}
                <div>
                    <label className="block text-sm mb-1.5"
                           style={{ color: 'var(--color-text-secondary)' }}>
                        Nome utente
                    </label>
                    <input
                        type="text"
                        value={data.username}
                        onChange={e => setData('username', e.target.value)}
                        autoComplete="username"
                        autoFocus
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none transition-colors"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            border: `1px solid ${errors?.username ? '#ef4444' : 'var(--color-border)'}`,
                            color: 'var(--color-text-primary)',
                        }}
                        placeholder="username"
                    />
                    {errors?.username && (
                        <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{errors.username}</p>
                    )}
                </div>

                {/* Password */}
                <div>
                    <label className="block text-sm mb-1.5"
                           style={{ color: 'var(--color-text-secondary)' }}>
                        Password
                    </label>
                    <input
                        type="password"
                        value={data.password}
                        onChange={e => setData('password', e.target.value)}
                        autoComplete="current-password"
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                        style={{
                            backgroundColor: 'var(--color-bg-secondary)',
                            border: `1px solid ${errors?.password ? '#ef4444' : 'var(--color-border)'}`,
                            color: 'var(--color-text-primary)',
                        }}
                        placeholder="••••••••"
                    />
                    {errors?.password && (
                        <p className="mt-1 text-xs" style={{ color: '#ef4444' }}>{errors.password}</p>
                    )}
                </div>

                {/* Submit */}
                <button
                    type="submit"
                    disabled={processing}
                    className="w-full py-2.5 rounded-lg text-sm font-semibold tracking-wide transition-opacity disabled:opacity-60"
                    style={{
                        backgroundColor: 'var(--color-parlato)',
                        color: '#fff',
                    }}>
                    {processing ? 'Accesso in corso...' : 'ACCEDI'}
                </button>
            </form>

            <p className="mt-6 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                RS Mioni — Smartera Group
            </p>
        </GuestLayout>
    );
}
