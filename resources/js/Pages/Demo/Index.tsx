import { Head, Link, router, useForm } from '@inertiajs/react';
import { FormEvent, useEffect, useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';

/**
 * Scheda da compilare prima di una demo cliente.
 * Il testo dell'anteprima è lo stesso che SchedaDemoService passa all'assistente.
 */

interface Voce {
    nome: string;
    nota: string;
}

interface Scheda {
    nome: string;
    numero_camere: number | '';
    checkin: string;
    checkout: string;
    colazione: string;
    autobus: string;
    trasporto: string;
    ristoranti: Voce[];
    luoghi: Voce[];
    note: string;
}

interface Props {
    hotel: {
        id: string;
        nome_anagrafica: string;
        camere_in_anagrafica: number;
        aggiornato_at: string | null;
    };
    scheda: Scheda | null;
    generica: boolean;
    account: {
        receptionist: string | null;
        chiosco: string | null;
    };
}

const inputStyle = {
    backgroundColor: 'rgba(0,0,0,0.04)',
    border: '1px solid var(--color-border)',
    color: 'var(--color-text-primary)',
};

/** Dati del form: la scheda più la password opzionale degli account di prova (mai mostrata). */
type FormDati = Scheda & { password_prova: string };

export default function Index({ hotel, scheda, generica, account }: Props) {
    const form = useForm<FormDati>({ ...prepara(scheda), password_prova: '' });

    useEffect(() => {
        form.setData({ ...prepara(scheda), password_prova: '' });
        form.clearErrors();
        // Si riallinea dopo un salvataggio o un ripristino.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotel.aggiornato_at]);

    const set = <K extends keyof FormDati>(key: K, value: FormDati[K]) => {
        form.setData(current => ({ ...current, [key]: value }));
    };

    const cambiaVoce = (lista: 'ristoranti' | 'luoghi', index: number, campo: keyof Voce, valore: string) => {
        const voci = form.data[lista].map((voce, i) => i === index ? { ...voce, [campo]: valore } : voce);
        form.setData(lista, voci);
    };

    const aggiungiVoce = (lista: 'ristoranti' | 'luoghi') => {
        form.setData(lista, [...form.data[lista], { nome: '', nota: '' }]);
    };

    const togliVoce = (lista: 'ristoranti' | 'luoghi', index: number) => {
        const voci = form.data[lista].filter((_, i) => i !== index);
        form.setData(lista, voci.length > 0 ? voci : [{ nome: '', nota: '' }]);
    };

    const submit = (e: FormEvent) => {
        e.preventDefault();
        form.transform(data => ({
            ...data,
            ristoranti: data.ristoranti.filter(v => v.nome.trim() !== ''),
            luoghi: data.luoghi.filter(v => v.nome.trim() !== ''),
        }));
        form.put('/demo', { preserveScroll: true });
    };

    const [inCerca, setInCerca] = useState(false);
    const [notaCerca, setNotaCerca] = useState<string | null>(null);
    const [erroreCerca, setErroreCerca] = useState<string | null>(null);

    const recupera = async () => {
        const nome = form.data.nome.trim();
        if (nome.length < 3) {
            setErroreCerca('Scrivi il nome dell\'hotel, meglio se con la città.');
            return;
        }
        setInCerca(true);
        setErroreCerca(null);
        setNotaCerca(null);
        try {
            const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
            const risposta = await fetch('/demo/cerca', {
                method: 'POST',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': token,
                },
                body: JSON.stringify({ nome }),
            });
            const corpo = await risposta.json().catch(() => ({}));
            if (!risposta.ok) {
                setErroreCerca(typeof corpo.message === 'string' ? corpo.message : 'Ricerca non riuscita.');
                return;
            }
            const scheda = corpo.scheda ?? {};
            form.setData(current => ({
                ...current,
                nome: scheda.nome || nome,
                numero_camere: scheda.numero_camere ?? '',
                checkin: scheda.checkin ?? '',
                checkout: scheda.checkout ?? '',
                colazione: scheda.colazione ?? '',
                autobus: scheda.autobus ?? '',
                trasporto: scheda.trasporto ?? '',
                ristoranti: Array.isArray(scheda.ristoranti) && scheda.ristoranti.length > 0 ? scheda.ristoranti : [{ nome: '', nota: '' }],
                luoghi: Array.isArray(scheda.luoghi) && scheda.luoghi.length > 0 ? scheda.luoghi : [{ nome: '', nota: '' }],
            }));
            const mancanti = Array.isArray(corpo.mancanti) && corpo.mancanti.length > 0
                ? ` Non trovato: ${corpo.mancanti.join(', ')}.`
                : '';
            setNotaCerca(`Trovato: ${corpo.dove}. Fonte: ${corpo.fonte}.${mancanti} Controlla e salva.`);
        } catch {
            setErroreCerca('Ricerca non disponibile in questo momento.');
        } finally {
            setInCerca(false);
        }
    };

    const camereDiverse = form.data.numero_camere !== '' && form.data.numero_camere !== hotel.camere_in_anagrafica;
    const anteprima = componi(form.data);

    return (
        <GestoreHotelLayout>
            <Head title="Scheda demo" />

            <form onSubmit={submit} className="max-w-6xl mx-auto flex flex-col gap-5">
                <div className="flex flex-wrap items-end justify-between gap-3 px-1">
                    <div>
                        <h1 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Scheda demo
                            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--color-text-muted)' }}>
                                hotel di prova, come una struttura vera
                            </span>
                        </h1>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                            {generica
                                ? 'Senza un hotel preciso resta quello generico. Scrivi nome e città per recuperare orari e dintorni.'
                                : `Impostazioni personalizzate su ${hotel.nome_anagrafica}. Alice usa solo queste.`}
                        </p>
                    </div>
                    <span
                        className="rounded px-2 py-0.5 font-mono uppercase"
                        style={{
                            fontSize: '9px',
                            letterSpacing: '0.06em',
                            color: generica ? '#f59e0b' : '#22c55e',
                            backgroundColor: generica ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)',
                            border: `1px solid ${generica ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`,
                        }}
                    >
                        {generica ? 'Hotel generico' : 'Personalizzata'}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => router.post('/demo/prova', { come: 'receptionist' })}
                        disabled={!account.receptionist}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: '#3b82f6', color: '#fff' }}>
                        Prova portineria{account.receptionist ? ` (${account.receptionist})` : ''}
                    </button>
                    <button type="button" onClick={() => router.post('/demo/prova', { come: 'chiosco' })}
                        disabled={!account.chiosco}
                        className="px-3 py-1.5 rounded-lg text-xs font-medium"
                        style={{ backgroundColor: 'transparent', color: '#93c5fd', border: '1px solid rgba(59,130,246,0.45)' }}>
                        Prova chiosco{account.chiosco ? ` (${account.chiosco})` : ''}
                    </button>
                    {!generica && (
                        <button type="button"
                            onClick={() => { if (confirm('Tornare all\'hotel generico? Le informazioni che hai scritto vengono sostituite.')) router.post('/demo/ripristina'); }}
                            className="px-3 py-1.5 text-xs underline"
                            style={{ color: 'var(--color-text-muted)' }}>
                            Ripristina hotel generico
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
                    <div className="space-y-5">
                        <Section title="Struttura">
                            <Field label="Nome hotel in demo" error={form.errors.nome || erroreCerca || undefined} required>
                                <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                        value={form.data.nome}
                                        onChange={e => set('nome', e.target.value)}
                                        required
                                        placeholder="Nome e città, es. Villa Gasparini Montegrotto"
                                        className="w-full rounded-lg px-3 py-2 text-sm"
                                        style={inputStyle}
                                    />
                                    <button
                                        type="button"
                                        onClick={recupera}
                                        disabled={inCerca}
                                        className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium"
                                        style={{ backgroundColor: inCerca ? 'rgba(59,130,246,0.4)' : '#3b82f6', color: '#fff' }}
                                    >
                                        {inCerca ? 'Cerco…' : 'Recupera informazioni'}
                                    </button>
                                </div>
                                {notaCerca && (
                                    <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>{notaCerca}</p>
                                )}
                            </Field>
                            <Field label="Camere da comunicare" error={form.errors.numero_camere} required>
                                <input
                                    type="number"
                                    min={1}
                                    max={500}
                                    value={form.data.numero_camere}
                                    onChange={e => set('numero_camere', e.target.value === '' ? '' : Number(e.target.value))}
                                    placeholder="Es. 15"
                                    required
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={inputStyle}
                                />
                                <p className="text-xs mt-1" style={{ color: camereDiverse ? '#f59e0b' : 'var(--color-text-muted)' }}>
                                    In anagrafica ci sono {hotel.camere_in_anagrafica} camere.
                                    {camereDiverse && ' Alice dirà il numero scritto qui, non quello dell\'anagrafica. '}
                                    <Link href="/camere" className="underline">Apri Camere</Link>
                                </p>
                            </Field>
                        </Section>

                        <Section title="Orari">
                            <Field label="Check-in" error={form.errors.checkin}>
                                <input value={form.data.checkin} onChange={e => set('checkin', e.target.value)} placeholder="Es. Mattina fino alle 15" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                            </Field>
                            <Field label="Check-out" error={form.errors.checkout}>
                                <input value={form.data.checkout} onChange={e => set('checkout', e.target.value)} placeholder="Es. Fino alle 10" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    Se c'è un orario (10 oppure 10:30), aggiorna anche il check-out dell'hotel.
                                </p>
                            </Field>
                            <Field label="Colazione" error={form.errors.colazione}>
                                <input value={form.data.colazione} onChange={e => set('colazione', e.target.value)} placeholder="Es. Dalle 7 alle 10" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                            </Field>
                        </Section>

                        <Section title="Come arrivare">
                            <Field label="Autobus" error={form.errors.autobus}>
                                <input value={form.data.autobus} onChange={e => set('autobus', e.target.value)} placeholder="Es. Autobus davanti" className="w-full rounded-lg px-3 py-2 text-sm" style={inputStyle} />
                            </Field>
                            <Field label="Trasporto e taxi" error={form.errors.trasporto}>
                                <textarea value={form.data.trasporto} onChange={e => set('trasporto', e.target.value)} rows={2} placeholder="Es. Servizio di trasporto e taxi lì vicino, orari qualsiasi" className="w-full rounded-lg px-3 py-2 text-sm" style={{ ...inputStyle, resize: 'vertical' }} />
                            </Field>
                        </Section>

                        <Lista
                            titolo="Ristoranti consigliati"
                            vuoto="Nessun ristorante: Alice dirà che non ce ne sono di indicati."
                            placeholderNome="Es. Trattoria del centro"
                            placeholderNota="Es. cucina locale, 5 minuti a piedi"
                            voci={form.data.ristoranti}
                            errori={form.errors}
                            prefisso="ristoranti"
                            onChange={(i, campo, valore) => cambiaVoce('ristoranti', i, campo, valore)}
                            onAdd={() => aggiungiVoce('ristoranti')}
                            onRemove={i => togliVoce('ristoranti', i)}
                        />

                        <Lista
                            titolo="Luoghi da visitare"
                            vuoto="Nessun luogo: Alice dirà che non ce ne sono di indicati."
                            placeholderNome="Es. Centro termale"
                            placeholderNota="Es. a due passi dall'hotel"
                            voci={form.data.luoghi}
                            errori={form.errors}
                            prefisso="luoghi"
                            onChange={(i, campo, valore) => cambiaVoce('luoghi', i, campo, valore)}
                            onAdd={() => aggiungiVoce('luoghi')}
                            onRemove={i => togliVoce('luoghi', i)}
                        />

                        <Section title="Altre informazioni per Alice">
                            <Field label="Regole e informazioni senza un campo dedicato" error={form.errors.note}>
                                <textarea
                                    value={form.data.note}
                                    onChange={e => set('note', e.target.value)}
                                    rows={4}
                                    placeholder={"Es. Animali ammessi di piccola taglia, 15 euro a notte.\nParcheggio gratuito dietro l'hotel.\nWi-Fi: rete HotelDemo, password sul comodino."}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={{ ...inputStyle, resize: 'vertical' }}
                                />
                                <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                    Una riga per argomento. Alice legge anche le regole valorizzate nel{' '}
                                    <Link href="/regolamento" className="underline">Regolamento</Link> dell'hotel
                                    (animali, parcheggio, wifi…): scrivile lì oppure qui, le dice allo stesso modo.
                                </p>
                            </Field>
                        </Section>

                        <Section title="Account di prova">
                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                Con «Prova portineria» e «Prova chiosco» entri da qui senza password.
                                Per una demo su due dispositivi (totem da una parte, portineria dall'altra) imposta una password:
                                vale per {account.receptionist ? <code>{account.receptionist}</code> : 'il receptionist'} e {account.chiosco ? <code>{account.chiosco}</code> : 'il chiosco'}.
                            </p>
                            <Field label="Nuova password per i due account (lascia vuoto per non cambiarla)" error={form.errors.password_prova}>
                                <input
                                    type="password"
                                    autoComplete="new-password"
                                    value={form.data.password_prova}
                                    onChange={e => set('password_prova', e.target.value)}
                                    placeholder="Almeno 8 caratteri"
                                    className="w-full max-w-sm rounded-lg px-3 py-2 text-sm"
                                    style={inputStyle}
                                />
                            </Field>
                        </Section>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={form.processing}
                                className="px-6 py-2 rounded-lg text-sm font-medium"
                                style={{
                                    backgroundColor: form.processing ? 'rgba(59,130,246,0.4)' : '#3b82f6',
                                    color: '#fff',
                                    cursor: form.processing ? 'default' : 'pointer',
                                }}
                            >
                                {form.processing ? 'Salvataggio…' : 'Salva scheda demo'}
                            </button>
                        </div>
                    </div>

                    <aside className="lg:sticky lg:top-0 rounded-xl p-4" style={{ backgroundColor: 'var(--color-bg-secondary)', border: '1px solid var(--color-border)' }}>
                        <h2 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>
                            Quello che può dire Alice
                        </h2>
                        <pre className="text-xs whitespace-pre-wrap font-sans leading-relaxed" style={{ color: 'var(--color-text-secondary)' }}>
                            {anteprima}
                        </pre>
                    </aside>
                </div>
            </form>
        </GestoreHotelLayout>
    );
}

function prepara(scheda: Scheda | null): Scheda {
    const base: Scheda = scheda ?? {
        nome: '',
        numero_camere: '',
        checkin: '',
        checkout: '',
        colazione: '',
        autobus: '',
        trasporto: '',
        ristoranti: [],
        luoghi: [],
        note: '',
    };
    return {
        ...base,
        note: base.note ?? '',
        ristoranti: base.ristoranti.length > 0 ? base.ristoranti.map(v => ({ ...v })) : [{ nome: '', nota: '' }],
        luoghi: base.luoghi.length > 0 ? base.luoghi.map(v => ({ ...v })) : [{ nome: '', nota: '' }],
    };
}

function componi(scheda: Scheda): string {
    const linee: string[] = [];
    const riga = (etichetta: string, valore: string) => {
        const testo = valore.trim();
        if (testo !== '') linee.push(`${etichetta}: ${testo}`);
    };
    riga('Nome hotel', scheda.nome);
    if (scheda.numero_camere !== '' && Number(scheda.numero_camere) > 0) {
        linee.push(`Camere: ${Number(scheda.numero_camere)}`);
    }
    riga('Check-in', scheda.checkin);
    riga('Check-out', scheda.checkout);
    riga('Colazione', scheda.colazione);
    riga('Autobus', scheda.autobus);
    riga('Trasporto e taxi', scheda.trasporto);
    linee.push(elenco('Ristoranti consigliati', scheda.ristoranti));
    linee.push(elenco('Luoghi da visitare', scheda.luoghi));
    if (scheda.note.trim() !== '') linee.push(`Altre informazioni:\n${scheda.note.trim()}`);
    return linee.join('\n');
}

function elenco(titolo: string, voci: Voce[]): string {
    const piene = voci.filter(v => v.nome.trim() !== '');
    if (piene.length === 0) return `${titolo}: nessuno indicato.`;
    return [
        `${titolo}:`,
        ...piene.map(v => `- ${v.nome.trim()}${v.nota.trim() !== '' ? ` — ${v.nota.trim()}` : ''}`),
    ].join('\n');
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

function Lista({
    titolo, vuoto, placeholderNome, placeholderNota, voci, errori, prefisso, onChange, onAdd, onRemove,
}: {
    titolo: string;
    vuoto: string;
    placeholderNome: string;
    placeholderNota: string;
    voci: Voce[];
    errori: Record<string, string>;
    prefisso: string;
    onChange: (index: number, campo: keyof Voce, valore: string) => void;
    onAdd: () => void;
    onRemove: (index: number) => void;
}) {
    const compilate = voci.some(v => v.nome.trim() !== '');
    return (
        <Section title={titolo}>
            {!compilate && <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{vuoto}</p>}
            <div className="space-y-2">
                {voci.map((voce, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-2">
                        <input
                            value={voce.nome}
                            onChange={e => onChange(i, 'nome', e.target.value)}
                            placeholder={placeholderNome}
                            className="w-full rounded-lg px-3 py-2 text-sm"
                            style={inputStyle}
                        />
                        <input
                            value={voce.nota}
                            onChange={e => onChange(i, 'nota', e.target.value)}
                            placeholder={placeholderNota}
                            className="w-full rounded-lg px-3 py-2 text-sm"
                            style={inputStyle}
                        />
                        <button type="button" onClick={() => onRemove(i)} className="text-xs px-2" style={{ color: 'var(--color-text-muted)' }} title="Togli">
                            Togli
                        </button>
                        {(errori[`${prefisso}.${i}.nome`] || errori[`${prefisso}.${i}.nota`]) && (
                            <p className="sm:col-span-3 text-xs" style={{ color: '#ef4444' }}>
                                {errori[`${prefisso}.${i}.nome`] || errori[`${prefisso}.${i}.nota`]}
                            </p>
                        )}
                    </div>
                ))}
            </div>
            <button type="button" onClick={onAdd} className="text-xs font-medium" style={{ color: '#60a5fa' }}>
                Aggiungi
            </button>
        </Section>
    );
}
