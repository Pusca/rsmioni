import { Head, Link, router } from '@inertiajs/react';
import { useState } from 'react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';

// ── Tipi ─────────────────────────────────────────────────────────────────────

interface ChioscoData {
    id:              string;
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

type EsitoSingolo = 'ok' | 'ko' | 'non_testato' | 'non_richiesto';

interface EsitoTest {
    esito:    EsitoSingolo;
    dettaglio: string | null;
}

interface CollaudoRecord {
    id:               string;
    esito:            'superato' | 'parziale' | 'fallito';
    sorgente:         'kiosk' | 'gestore';
    note:             string | null;
    esiti_test:       Record<string, EsitoTest> | null;
    versione_browser: string | null;
    ip_rilevato:      string | null;
    eseguito_da:      string | null;
    created_at:       string;
}

interface Props {
    chiosco:  ChioscoData;
    collaudi: CollaudoRecord[];
}

// ── Definizione test ──────────────────────────────────────────────────────────

interface DefinizioneTest {
    key:         string;
    label:       string;
    categoria:   'browser' | 'hardware';
    descrizione: string;
}

const TESTS: DefinizioneTest[] = [
    { key: 'webcam',     label: 'Webcam',              categoria: 'browser',   descrizione: 'Test accesso fotocamera tramite browser (getUserMedia).' },
    { key: 'microfono',  label: 'Microfono',            categoria: 'browser',   descrizione: 'Test accesso microfono tramite browser (getUserMedia).' },
    { key: 'audio',      label: 'Altoparlante / Audio', categoria: 'browser',   descrizione: 'Test riproduzione audio tramite Web Audio API.' },
    { key: 'fullscreen', label: 'Schermo intero',       categoria: 'browser',   descrizione: 'Test supporto Fullscreen API per modalità kiosk.' },
    { key: 'pos',        label: 'Terminale POS',        categoria: 'hardware',  descrizione: 'Richiede kiosk-agent Windows installato sul dispositivo.' },
    { key: 'stampante',  label: 'Stampante',            categoria: 'hardware',  descrizione: 'Richiede kiosk-agent Windows installato sul dispositivo.' },
];

// ── Componente principale ─────────────────────────────────────────────────────

export default function Collaudo({ chiosco, collaudi }: Props) {
    const ultimoKiosk   = collaudi.find(c => c.sorgente === 'kiosk');
    const ultimoGestore = collaudi.find(c => c.sorgente === 'gestore');

    const [esito,  setEsito]  = useState<'superato' | 'parziale' | 'fallito'>('superato');
    const [note,   setNote]   = useState('');
    const [saving, setSaving] = useState(false);

    const handleSalvaVerbale = (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        router.post(`/configurazioni/chioschi/${chiosco.id}/collaudo`, {
            esito,
            note: note || null,
        }, {
            onFinish: () => setSaving(false),
        });
    };

    return (
        <GestoreHotelLayout>
            <Head title={`Collaudo — ${chiosco.nome}`} />

            <div className="max-w-4xl mx-auto py-8 px-6 space-y-6">

                {/* ── Header ── */}
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>
                            <Link href="/configurazioni/hotel" style={{ color: 'var(--color-text-muted)' }} className="hover:underline">Configurazioni</Link>
                            <span>/</span>
                            <Link href="/configurazioni/chioschi" style={{ color: 'var(--color-text-muted)' }} className="hover:underline">Chioschi</Link>
                            <span>/</span>
                            <Link href={`/configurazioni/chioschi/${chiosco.id}/edit`} style={{ color: 'var(--color-text-muted)' }} className="hover:underline">{chiosco.nome}</Link>
                            <span>/</span>
                            <span>Collaudo</span>
                        </div>
                        <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                            Collaudo — {chiosco.nome}
                        </h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <Link href={`/configurazioni/chioschi/${chiosco.id}/edit`}
                            className="px-3 py-1.5 rounded text-xs"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            Modifica configurazione
                        </Link>
                        <Link href="/configurazioni/chioschi"
                            className="px-3 py-1.5 rounded text-xs"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            ← Chioschi
                        </Link>
                    </div>
                </div>

                {/* ── Riepilogo configurazione ── */}
                <Section title="Riepilogo configurazione">
                    <div className="grid grid-cols-2 gap-x-8 gap-y-3">
                        <ConfigRow label="Hotel"         value={chiosco.hotel?.nome ?? '—'} />
                        <ConfigRow label="Tipo"          value={chiosco.tipo === 'touch' ? 'Touch (touchscreen)' : 'Analogico (campanello fisico)'} />
                        <ConfigRow label="Stato"         value={chiosco.attivo ? 'Attivo' : 'Non attivo'}  color={chiosco.attivo ? '#22c55e' : '#ef4444'} />
                        <ConfigRow label="Interattivo"   value={chiosco.interattivo ? 'Sì' : 'No'} />
                        <ConfigRow label="Indirizzo IP"  value={chiosco.ip_address ?? '⚠ Non configurato'} color={chiosco.ip_address ? undefined : '#f59e0b'} />
                        <ConfigRow label="POS remoto"    value={chiosco.has_pos ? `Sì — ${chiosco.tipo_pos ?? 'tipo n.d.'}` : 'No'} />
                        <ConfigRow label="Stampante"     value={chiosco.has_stampante ? 'Sì' : 'No'} />
                        {chiosco.has_pos && chiosco.tipo_pos === 'ingenico' && (
                            <>
                                <ConfigRow label="Path input POS"  value={chiosco.path_input_pos  ?? '⚠ Non configurato'} color={chiosco.path_input_pos  ? undefined : '#f59e0b'} />
                                <ConfigRow label="Path output POS" value={chiosco.path_output_pos ?? '⚠ Non configurato'} color={chiosco.path_output_pos ? undefined : '#f59e0b'} />
                            </>
                        )}
                    </div>

                    {/* Avvertenze configurazione */}
                    {(! chiosco.ip_address || (chiosco.has_pos && (! chiosco.path_input_pos || ! chiosco.path_output_pos))) && (
                        <div className="mt-4 rounded-lg px-4 py-3 text-xs"
                            style={{ backgroundColor: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.25)', color: '#f59e0b' }}>
                            ⚠ Completare la configurazione prima del collaudo: alcuni parametri obbligatori mancano.
                        </div>
                    )}
                </Section>

                {/* ── Test del dispositivo ── */}
                <Section title="Test del dispositivo">

                    {/* Nota operativa */}
                    <div className="rounded-lg px-4 py-3 text-xs mb-4"
                        style={{ backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', color: 'var(--color-text-muted)' }}>
                        <p className="font-medium mb-1" style={{ color: '#3b82f6' }}>ℹ Come eseguire il collaudo sul dispositivo</p>
                        <ol className="list-decimal list-inside space-y-0.5">
                            <li>Accedere fisicamente al dispositivo kiosk.</li>
                            <li>Aprire il browser e navigare a <span className="font-mono">/kiosk/collaudo</span> (accesso con credenziali profilo Chiosco).</li>
                            <li>Eseguire i test browser direttamente sul dispositivo.</li>
                            <li>I risultati vengono salvati automaticamente e sono visibili qui.</li>
                        </ol>
                    </div>

                    {/* Tabella test */}
                    <table className="w-full text-sm">
                        <thead>
                            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                <Th>Test</Th>
                                <Th>Categoria</Th>
                                <Th>Descrizione</Th>
                                <Th align="right">Ultimo esito</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {TESTS.map((test, i) => {
                                const isRequired = (test.key === 'pos' && ! chiosco.has_pos) || (test.key === 'stampante' && ! chiosco.has_stampante)
                                    ? false : true;
                                const esito = isRequired
                                    ? (ultimoKiosk?.esiti_test?.[test.key]?.esito ?? null)
                                    : 'non_richiesto';

                                return (
                                    <tr key={test.key}
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                        }}>
                                        <Td>
                                            <span className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                                                {test.label}
                                            </span>
                                        </Td>
                                        <Td>
                                            <span className="rounded px-2 py-0.5 text-xs font-mono"
                                                style={{
                                                    color:           test.categoria === 'browser' ? '#60a5fa' : '#a78bfa',
                                                    backgroundColor: test.categoria === 'browser' ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)',
                                                    border:          `1px solid ${test.categoria === 'browser' ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)'}`,
                                                }}>
                                                {test.categoria === 'browser' ? 'Browser' : 'Hardware'}
                                            </span>
                                        </Td>
                                        <Td>
                                            <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
                                                {test.descrizione}
                                            </span>
                                        </Td>
                                        <Td align="right">
                                            <PillEsito esito={esito} />
                                        </Td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {ultimoKiosk && (
                        <p className="text-xs mt-3" style={{ color: 'var(--color-text-muted)' }}>
                            Ultimo collaudo kiosk: <span style={{ color: 'var(--color-text-secondary)' }}>{ultimoKiosk.created_at}</span>
                            {ultimoKiosk.ip_rilevato && <> · IP {ultimoKiosk.ip_rilevato}</>}
                            {ultimoKiosk.versione_browser && <> · {ultimoKiosk.versione_browser}</>}
                        </p>
                    )}
                </Section>

                {/* ── Verbale collaudo (Gestore) ── */}
                <Section title="Registra verbale di collaudo">
                    <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                        Il verbale è una registrazione formale dell'esito del collaudo,
                        da compilare dopo aver eseguito tutti i test sul dispositivo.
                    </p>
                    <form onSubmit={handleSalvaVerbale} className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                                    Esito globale <span style={{ color: '#ef4444' }}>*</span>
                                </label>
                                <select value={esito} onChange={e => setEsito(e.target.value as typeof esito)}
                                    className="w-full rounded-lg px-3 py-2 text-sm"
                                    style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                                    <option value="superato">Superato — tutti i requisiti soddisfatti</option>
                                    <option value="parziale">Parziale — alcuni test non superati</option>
                                    <option value="fallito">Fallito — collaudo non superato</option>
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Note / osservazioni</label>
                            <textarea
                                value={note}
                                onChange={e => setNote(e.target.value)}
                                rows={3}
                                placeholder="Eventuali osservazioni, anomalie riscontrate, interventi effettuati…"
                                className="w-full rounded-lg px-3 py-2 text-sm resize-none"
                                style={{ backgroundColor: 'rgba(255,255,255,0.04)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                            />
                        </div>
                        <div className="flex justify-end">
                            <button type="submit" disabled={saving}
                                className="px-6 py-2 rounded-lg text-sm font-medium"
                                style={{
                                    backgroundColor: saving ? 'rgba(59,130,246,0.4)' : '#3b82f6',
                                    color: '#fff', border: 'none',
                                    cursor: saving ? 'default' : 'pointer',
                                }}>
                                {saving ? 'Salvataggio…' : 'Registra verbale'}
                            </button>
                        </div>
                    </form>
                </Section>

                {/* ── Storico collaudi ── */}
                {collaudi.length > 0 && (
                    <Section title="Storico collaudi">
                        <table className="w-full text-xs">
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                                    <Th>Data</Th>
                                    <Th>Sorgente</Th>
                                    <Th>Esito</Th>
                                    <Th>Operatore</Th>
                                    <Th>Note</Th>
                                    <Th>IP</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {collaudi.map((c, i) => (
                                    <tr key={c.id}
                                        style={{
                                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                                            backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)',
                                        }}>
                                        <Td><span className="font-mono">{c.created_at}</span></Td>
                                        <Td>
                                            <span className="rounded px-1.5 py-0.5 text-xs"
                                                style={{
                                                    color:           c.sorgente === 'kiosk' ? '#60a5fa' : '#a78bfa',
                                                    backgroundColor: c.sorgente === 'kiosk' ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)',
                                                    border:          `1px solid ${c.sorgente === 'kiosk' ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)'}`,
                                                }}>
                                                {c.sorgente === 'kiosk' ? 'Browser kiosk' : 'Verbale gestore'}
                                            </span>
                                        </Td>
                                        <Td><PillEsito esito={c.esito} /></Td>
                                        <Td><span style={{ color: 'var(--color-text-muted)' }}>{c.eseguito_da ?? '—'}</span></Td>
                                        <Td>
                                            <span style={{ color: 'var(--color-text-muted)' }}>
                                                {c.note ? (c.note.length > 60 ? c.note.slice(0, 60) + '…' : c.note) : '—'}
                                            </span>
                                        </Td>
                                        <Td><span className="font-mono" style={{ color: 'var(--color-text-muted)' }}>{c.ip_rilevato ?? '—'}</span></Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </Section>
                )}
            </div>
        </GestoreHotelLayout>
    );
}

// ── Sub-componenti ────────────────────────────────────────────────────────────

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

function ConfigRow({ label, value, color }: { label: string; value: string; color?: string }) {
    return (
        <div className="flex items-center justify-between py-1 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{label}</span>
            <span className="text-xs font-medium" style={{ color: color ?? 'var(--color-text-secondary)' }}>{value}</span>
        </div>
    );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
    return (
        <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider"
            style={{ color: 'var(--color-text-muted)', textAlign: align }}>
            {children}
        </th>
    );
}

function Td({ children, align }: { children: React.ReactNode; align?: 'right' }) {
    return (
        <td className="px-4 py-2.5" style={{ color: 'var(--color-text-secondary)', textAlign: align }}>
            {children}
        </td>
    );
}

function PillEsito({ esito }: { esito: string | null }) {
    if (esito === null) {
        return <span className="text-xs" style={{ color: 'var(--color-text-muted)', fontStyle: 'italic' }}>non eseguito</span>;
    }

    const cfg: Record<string, { label: string; color: string; bg: string; border: string }> = {
        ok:           { label: '✓ OK',          color: '#22c55e', bg: 'rgba(34,197,94,0.08)',    border: 'rgba(34,197,94,0.25)'    },
        ko:           { label: '✗ Fallito',      color: '#ef4444', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.25)'    },
        non_testato:  { label: '— Da eseguire',  color: '#94a3b8', bg: 'rgba(148,163,184,0.08)', border: 'rgba(148,163,184,0.25)' },
        non_richiesto:{ label: 'N/A',            color: '#5c6380', bg: 'rgba(92,99,128,0.08)',   border: 'rgba(92,99,128,0.25)'   },
        superato:     { label: '✓ Superato',     color: '#22c55e', bg: 'rgba(34,197,94,0.08)',    border: 'rgba(34,197,94,0.25)'    },
        parziale:     { label: '~ Parziale',     color: '#f59e0b', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)'  },
        fallito:      { label: '✗ Fallito',      color: '#ef4444', bg: 'rgba(239,68,68,0.08)',    border: 'rgba(239,68,68,0.25)'    },
    };

    const style = cfg[esito] ?? cfg.non_testato;
    return (
        <span className="rounded px-2 py-0.5 text-xs"
            style={{ color: style.color, backgroundColor: style.bg, border: `1px solid ${style.border}` }}>
            {style.label}
        </span>
    );
}
