import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent, useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';

/**
 * Account dell'hotel demo: elenco, nuova password generata (mostrata una
 * sola volta), password scelta a mano, creazione, disattivazione, cancellazione.
 */

interface Account {
    id: string;
    username: string;
    email: string;
    profilo: string;
    etichetta: string;
    attivo: boolean;
    sei_tu: boolean;
    altri_hotel: number;
}

interface Credenziale {
    username: string;
    profilo: string;
    password: string;
}

interface Props {
    hotel: { id: string; nome: string };
    account: Account[];
    profili: { value: string; label: string }[];
    credenziali: Credenziale[] | null;
}

const inputStyle = {
    backgroundColor: 'rgba(0,0,0,0.04)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
};

export default function Account({ hotel, account, profili, credenziali }: Props) {
    const [inCorso, setInCorso] = useState(false);
    const opzioni = { preserveScroll: true, onStart: () => setInCorso(true), onFinish: () => setInCorso(false) };

    const rigeneraTutte = () => {
        if (confirm(`Generare una nuova password per tutti i ${account.length} account dell'hotel demo? Quelle attuali smettono di valere subito.`)) {
            router.post('/demo/account/rigenera-tutte', {}, opzioni);
        }
    };

    return (
        <GestoreHotelLayout>
            <Head title="Account demo" />

            <div className="max-w-6xl mx-auto flex flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                        <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Account demo
                            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                                {hotel.nome}
                            </span>
                        </h1>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            Le password non si possono rileggere: quando ne generi una viene mostrata solo qui, subito.
                            Copiala prima di cambiare pagina. <Link href="/demo" className="underline">Torna alla scheda demo</Link>
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={rigeneraTutte}
                        disabled={inCorso || account.length === 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: '#3b82f6', color: '#fff', opacity: inCorso ? 0.5 : 1 }}
                    >
                        Nuove password per tutti
                    </button>
                </div>

                {credenziali && credenziali.length > 0 && <Credenziali righe={credenziali} />}

                <Section title={`Account collegati (${account.length})`}>
                    <div className="overflow-x-auto -mx-5 -mb-2">
                        <table className="w-full text-xs">
                            <thead>
                                <tr style={{ color: 'var(--color-text-muted)', borderBottom: '1px solid var(--color-border)' }}>
                                    <th className="text-left font-medium px-5 py-2">Utente</th>
                                    <th className="text-left font-medium px-3 py-2">Profilo</th>
                                    <th className="text-left font-medium px-3 py-2 hidden md:table-cell">Email</th>
                                    <th className="text-left font-medium px-3 py-2">Stato</th>
                                    <th className="text-right font-medium px-5 py-2">Azioni</th>
                                </tr>
                            </thead>
                            <tbody>
                                {account.map(a => (
                                    <Riga key={a.id} account={a} inCorso={inCorso} opzioni={opzioni} />
                                ))}
                                {account.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="px-5 py-6 text-center" style={{ color: 'var(--color-text-muted)' }}>
                                            Nessun account collegato all'hotel demo.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </Section>

                <NuovoAccount profili={profili} />
            </div>
        </GestoreHotelLayout>
    );
}

function Credenziali({ righe }: { righe: Credenziale[] }) {
    const [copiato, setCopiato] = useState(false);
    const testo = righe.map(r => `${r.username} (${r.profilo}): ${r.password}`).join('\n');

    const copia = async () => {
        try {
            await navigator.clipboard.writeText(testo);
            setCopiato(true);
            setTimeout(() => setCopiato(false), 2500);
        } catch {
            // Senza permesso appunti resta la selezione manuale del testo.
        }
    };

    return (
        <div
            className="rounded-xl p-5 space-y-3"
            style={{ backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.45)' }}
        >
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#f59e0b' }}>
                    Password nuove: mostrate solo adesso
                </h3>
                <button
                    type="button"
                    onClick={copia}
                    className="px-3 py-1 rounded-lg text-xs font-medium"
                    style={{ backgroundColor: '#f59e0b', color: '#1a1a1a' }}
                >
                    {copiato ? 'Copiate' : righe.length > 1 ? 'Copia tutte' : 'Copia'}
                </button>
            </div>
            <table className="text-sm">
                <tbody>
                    {righe.map(r => (
                        <tr key={r.username}>
                            <td className="pr-4 py-0.5" style={{ color: 'var(--color-text-primary)' }}>
                                <code>{r.username}</code>
                                <span className="ml-2 text-xs" style={{ color: 'var(--color-text-muted)' }}>{r.profilo}</span>
                            </td>
                            <td className="py-0.5">
                                <code className="select-all font-semibold tracking-wide" style={{ color: 'var(--color-text-primary)' }}>{r.password}</code>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Chi è già collegato con la password vecchia resta dentro finché non esce.
            </p>
        </div>
    );
}

function Riga({ account: a, inCorso, opzioni }: { account: Account; inCorso: boolean; opzioni: object }) {
    const [apertaManuale, setApertaManuale] = useState(false);
    const form = useForm({ password: '' });

    const rigenera = () => {
        const avviso = a.sei_tu
            ? `Generare una nuova password per il TUO account «${a.username}»? Resti collegato, ma al prossimo accesso serve quella nuova.`
            : `Generare una nuova password per «${a.username}»? Quella attuale smette di valere subito.`;
        if (confirm(avviso)) router.post(`/demo/account/${a.id}/rigenera`, {}, opzioni);
    };

    const imposta = (e: FormEvent) => {
        e.preventDefault();
        form.put(`/demo/account/${a.id}/password`, {
            preserveScroll: true,
            onSuccess: () => { form.reset(); setApertaManuale(false); },
        });
    };

    const cambiaAttivo = () => {
        const msg = a.attivo
            ? `Disattivare «${a.username}»? Non potrà più entrare finché non lo riattivi.`
            : `Riattivare «${a.username}»?`;
        if (confirm(msg)) router.put(`/demo/account/${a.id}/attivo`, { attivo: !a.attivo }, opzioni);
    };

    const elimina = () => {
        const msg = a.altri_hotel > 0
            ? `Staccare «${a.username}» dall'hotel demo? Resta attivo sugli altri ${a.altri_hotel} hotel.`
            : `Eliminare «${a.username}»? L'operazione non si può annullare.`;
        if (confirm(msg)) router.delete(`/demo/account/${a.id}`, opzioni);
    };

    const azione = 'px-2 py-1 rounded text-xs';

    return (
        <>
            <tr style={{ borderBottom: apertaManuale ? 'none' : '1px solid var(--color-border)', opacity: a.attivo ? 1 : 0.55 }}>
                <td className="px-5 py-2.5 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                    <code>{a.username}</code>
                    {a.sei_tu && <span className="ml-2 text-[10px] uppercase" style={{ color: '#60a5fa' }}>sei tu</span>}
                </td>
                <td className="px-3 py-2.5" style={{ color: 'var(--color-text-secondary)' }}>{a.etichetta}</td>
                <td className="px-3 py-2.5 hidden md:table-cell" style={{ color: 'var(--color-text-muted)' }}>{a.email}</td>
                <td className="px-3 py-2.5">
                    <span
                        className="rounded px-1.5 py-0.5 font-mono uppercase"
                        style={{
                            fontSize: '9px',
                            letterSpacing: '0.06em',
                            color: a.attivo ? '#22c55e' : '#ef4444',
                            backgroundColor: a.attivo ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                            border: `1px solid ${a.attivo ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}`,
                        }}
                    >
                        {a.attivo ? 'Attivo' : 'Disattivato'}
                    </span>
                </td>
                <td className="px-5 py-2.5">
                    <div className="flex flex-wrap justify-end gap-1">
                        <button type="button" onClick={rigenera} disabled={inCorso} className={azione} style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#93c5fd' }}>
                            Nuova password
                        </button>
                        <button type="button" onClick={() => setApertaManuale(v => !v)} className={azione} style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-secondary)' }}>
                            Scegli password
                        </button>
                        {!a.sei_tu && (
                            <>
                                <button type="button" onClick={cambiaAttivo} disabled={inCorso} className={azione} style={{ border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}>
                                    {a.attivo ? 'Disattiva' : 'Riattiva'}
                                </button>
                                <button type="button" onClick={elimina} disabled={inCorso} className={azione} style={{ color: '#ef4444' }}>
                                    Elimina
                                </button>
                            </>
                        )}
                    </div>
                </td>
            </tr>
            {apertaManuale && (
                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <td colSpan={5} className="px-5 pb-3">
                        <form onSubmit={imposta} className="flex flex-wrap items-start gap-2">
                            <div>
                                <input
                                    type="text"
                                    autoComplete="off"
                                    autoFocus
                                    value={form.data.password}
                                    onChange={e => form.setData('password', e.target.value)}
                                    placeholder={`Password per ${a.username} (almeno 8 caratteri)`}
                                    className="w-72 rounded-lg px-3 py-1.5 text-sm"
                                    style={inputStyle}
                                />
                                {form.errors.password && <p className="text-xs mt-1" style={{ color: '#ef4444' }}>{form.errors.password}</p>}
                            </div>
                            <button type="submit" disabled={form.processing} className="px-3 py-1.5 rounded-lg text-xs font-medium" style={{ backgroundColor: '#3b82f6', color: '#fff' }}>
                                Imposta
                            </button>
                            <button type="button" onClick={() => { setApertaManuale(false); form.reset(); form.clearErrors(); }} className="px-2 py-1.5 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Annulla
                            </button>
                        </form>
                    </td>
                </tr>
            )}
        </>
    );
}

function NuovoAccount({ profili }: { profili: Props['profili'] }) {
    const form = useForm({ username: '', profilo: 'receptionist', email: '' });

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.post('/demo/account', { preserveScroll: true, onSuccess: () => form.reset() });
    };

    return (
        <Section title="Nuovo account">
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                La password viene generata e mostrata una volta sola. L'account è collegato solo all'hotel demo.
            </p>
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_200px_minmax(0,1fr)_auto] gap-3 items-start">
                <Field label="Nome utente" error={form.errors.username} required>
                    <input
                        value={form.data.username}
                        onChange={e => form.setData('username', e.target.value)}
                        placeholder="Es. receptionist2"
                        autoComplete="off"
                        required
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={inputStyle}
                    />
                </Field>
                <Field label="Profilo" error={form.errors.profilo} required>
                    <select
                        value={form.data.profilo}
                        onChange={e => form.setData('profilo', e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={inputStyle}
                    >
                        {profili.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                    </select>
                </Field>
                <Field label="Email (facoltativa)" error={form.errors.email}>
                    <input
                        type="email"
                        value={form.data.email}
                        onChange={e => form.setData('email', e.target.value)}
                        placeholder="Se vuota: nomeutente@demo.rsmioni.it"
                        autoComplete="off"
                        className="w-full rounded-lg px-3 py-2 text-sm"
                        style={inputStyle}
                    />
                </Field>
                <div className="md:pt-5">
                    <button
                        type="submit"
                        disabled={form.processing}
                        className="px-4 py-2 rounded-lg text-sm font-medium"
                        style={{ backgroundColor: form.processing ? 'rgba(59,130,246,0.4)' : '#3b82f6', color: '#fff' }}
                    >
                        {form.processing ? 'Creo…' : 'Crea account'}
                    </button>
                </div>
            </form>
        </Section>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="rounded-xl p-5 space-y-4" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
            <h3 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{title}</h3>
            {children}
        </div>
    );
}

function Field({ label, children, error, required }: { label: string; children: React.ReactNode; error?: string; required?: boolean }) {
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
