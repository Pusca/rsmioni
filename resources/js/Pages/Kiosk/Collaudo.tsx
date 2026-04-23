import { Head, Link } from '@inertiajs/react';
import { useCallback, useRef, useState } from 'react';
import KioskLayout from '@/Layouts/KioskLayout';
import { Chiosco } from '@/types';

// ── Tipi ─────────────────────────────────────────────────────────────────────

type EsitoSingolo = 'non_testato' | 'in_corso' | 'ok' | 'ko' | 'non_richiesto';

interface StatoTest {
    esito:    EsitoSingolo;
    dettaglio: string;
}

interface TestiStato {
    webcam:     StatoTest;
    microfono:  StatoTest;
    audio:      StatoTest;
    fullscreen: StatoTest;
    pos:        StatoTest;
    stampante:  StatoTest;
}

interface UltimoCollaudo {
    esito:      string;
    esiti_test: Record<string, { esito: string; dettaglio: string | null }> | null;
    created_at: string;
}

interface Props {
    chiosco:         Chiosco;
    ultimo_collaudo: UltimoCollaudo | null;
}

// ── Stato iniziale ─────────────────────────────────────────────────────────

function statoIniziale(chiosco: Chiosco): TestiStato {
    return {
        webcam:     { esito: 'non_testato', dettaglio: '' },
        microfono:  { esito: 'non_testato', dettaglio: '' },
        audio:      { esito: 'non_testato', dettaglio: '' },
        fullscreen: { esito: 'non_testato', dettaglio: '' },
        pos:        chiosco.has_pos       ? { esito: 'non_testato', dettaglio: '' } : { esito: 'non_richiesto', dettaglio: 'POS non configurato su questo chiosco.' },
        stampante:  chiosco.has_stampante ? { esito: 'non_testato', dettaglio: '' } : { esito: 'non_richiesto', dettaglio: 'Stampante non configurata su questo chiosco.' },
    };
}

// ── Pagina collaudo ─────────────────────────────────────────────────────────

export default function KioskCollaudo({ chiosco, ultimo_collaudo }: Props) {
    const [testi, setTesti] = useState<TestiStato>(() => statoIniziale(chiosco));
    const [fase, setFase]   = useState<'test' | 'invio' | 'completato' | 'errore'>('test');
    const [esitoGlobale, setEsitoGlobale] = useState<string | null>(null);

    // Ref per preview webcam/microfono
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const aggiornaTest = useCallback((key: keyof TestiStato, stato: StatoTest) => {
        setTesti(prev => ({ ...prev, [key]: stato }));
    }, []);

    // ── Test: Webcam ───────────────────────────────────────────────────────

    const testWebcam = async () => {
        aggiornaTest('webcam', { esito: 'in_corso', dettaglio: 'Richiesta permesso fotocamera…' });
        try {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(t => t.stop());
            }
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            const devices = await navigator.mediaDevices.enumerateDevices();
            const cam     = devices.find(d => d.kind === 'videoinput');
            aggiornaTest('webcam', { esito: 'ok', dettaglio: cam?.label || 'Fotocamera accessibile' });
        } catch (err) {
            aggiornaTest('webcam', { esito: 'ko', dettaglio: (err as Error).message });
        }
    };

    // ── Test: Microfono ────────────────────────────────────────────────────

    const testMicrofono = async () => {
        aggiornaTest('microfono', { esito: 'in_corso', dettaglio: 'Richiesta permesso microfono…' });
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const devices = await navigator.mediaDevices.enumerateDevices();
            const mic     = devices.find(d => d.kind === 'audioinput');
            stream.getTracks().forEach(t => t.stop());
            aggiornaTest('microfono', { esito: 'ok', dettaglio: mic?.label || 'Microfono accessibile' });
        } catch (err) {
            aggiornaTest('microfono', { esito: 'ko', dettaglio: (err as Error).message });
        }
    };

    // ── Test: Audio (altoparlante) ─────────────────────────────────────────

    const testAudio = async () => {
        aggiornaTest('audio', { esito: 'in_corso', dettaglio: 'Riproduzione tono di test (440 Hz)…' });
        try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.value = 440;
            gain.gain.value = 0.2;
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            await new Promise<void>(r => setTimeout(r, 1200));
            osc.stop();
            await ctx.close();
            aggiornaTest('audio', { esito: 'ok', dettaglio: 'Tono 440 Hz riprodotto — verificare con le orecchie.' });
        } catch (err) {
            aggiornaTest('audio', { esito: 'ko', dettaglio: (err as Error).message });
        }
    };

    // ── Test: Fullscreen ───────────────────────────────────────────────────

    const testFullscreen = async () => {
        aggiornaTest('fullscreen', { esito: 'in_corso', dettaglio: 'Verifica Fullscreen API…' });
        try {
            if (! document.fullscreenEnabled) {
                aggiornaTest('fullscreen', { esito: 'ko', dettaglio: 'Fullscreen API non supportata da questo browser.' });
                return;
            }
            await document.documentElement.requestFullscreen();
            const isFs = !! document.fullscreenElement;
            if (document.exitFullscreen) {
                await document.exitFullscreen().catch(() => { /* ignore */ });
            }
            aggiornaTest('fullscreen', { esito: isFs ? 'ok' : 'ko', dettaglio: isFs ? 'Fullscreen attivato e disattivato correttamente.' : 'Fullscreen attivato ma non rilevato.' });
        } catch (err) {
            aggiornaTest('fullscreen', { esito: 'ko', dettaglio: (err as Error).message });
        }
    };

    // ── Test hardware: toggle manuale ──────────────────────────────────────

    const toggleHardware = (key: 'pos' | 'stampante') => {
        const stato = testi[key];
        if (stato.esito === 'non_richiesto') return;
        const nuovoEsito: EsitoSingolo = stato.esito === 'ok' ? 'ko'
            : stato.esito === 'ko' ? 'non_testato'
            : 'ok';
        const dettaglio = nuovoEsito === 'ok'  ? 'Verificato manualmente on-site.'
            : nuovoEsito === 'ko' ? 'Non funzionante — annotare in note.'
            : '';
        aggiornaTest(key, { esito: nuovoEsito, dettaglio });
    };

    // ── Salvataggio risultati ──────────────────────────────────────────────

    const salvaRisultati = async () => {
        setFase('invio');

        const esiti: Record<string, { esito: string; dettaglio: string }> = {};
        for (const [k, v] of Object.entries(testi)) {
            if (v.esito === 'in_corso') continue; // salta test non completati
            esiti[k] = { esito: v.esito, dettaglio: v.dettaglio };
        }

        const csrfToken = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';

        try {
            const res = await fetch('/kiosk/collaudo', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': csrfToken },
                body: JSON.stringify({
                    esiti_test:       esiti,
                    versione_browser: navigator.userAgent.slice(0, 200),
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setEsitoGlobale(data.esito);
                setFase('completato');
                // Ferma stream webcam se attivo
                streamRef.current?.getTracks().forEach(t => t.stop());
            } else {
                setFase('errore');
            }
        } catch {
            setFase('errore');
        }
    };

    // ── Schermata completato ───────────────────────────────────────────────

    if (fase === 'completato') {
        return (
            <KioskLayout>
                <Head title="Collaudo completato" />
                <div className="flex flex-col items-center justify-center h-full gap-6 text-center px-8">
                    <div className="text-5xl mb-2">{esitoGlobale === 'superato' ? '✓' : esitoGlobale === 'parziale' ? '~' : '✗'}</div>
                    <h1 className="text-2xl font-bold" style={{ color: esitoGlobale === 'superato' ? '#22c55e' : esitoGlobale === 'parziale' ? '#f59e0b' : '#ef4444' }}>
                        Collaudo {esitoGlobale === 'superato' ? 'superato' : esitoGlobale === 'parziale' ? 'parziale' : 'non superato'}
                    </h1>
                    <p className="text-sm" style={{ color: '#9ba3c0' }}>
                        I risultati sono stati salvati e sono visibili nella pagina Configurazioni del Gestore Hotel.
                    </p>
                    <Link href="/kiosk"
                        className="px-6 py-3 rounded-xl text-sm font-medium"
                        style={{ backgroundColor: '#3b82f6', color: '#fff' }}>
                        Torna alla schermata operativa
                    </Link>
                </div>
            </KioskLayout>
        );
    }

    // ── Layout test ────────────────────────────────────────────────────────

    const tuttiEseguiti = Object.values(testi).every(
        t => t.esito !== 'non_testato' && t.esito !== 'in_corso'
    );

    return (
        <KioskLayout>
            <Head title="Collaudo chiosco" />

            <div className="flex flex-col h-full overflow-auto">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 shrink-0"
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                    <div>
                        <h1 className="text-lg font-semibold" style={{ color: '#e8eaf2' }}>
                            Modalità Collaudo
                        </h1>
                        <p className="text-xs mt-0.5" style={{ color: '#5c6380' }}>
                            Chiosco: <span style={{ color: '#9ba3c0' }}>{chiosco.nome}</span>
                        </p>
                    </div>
                    <Link href="/kiosk" className="px-3 py-1.5 rounded text-xs"
                        style={{ color: '#5c6380', border: '1px solid rgba(255,255,255,0.08)' }}>
                        ← Esci dal collaudo
                    </Link>
                </div>

                {/* Corpo */}
                <div className="flex-1 overflow-auto px-6 py-5">

                    {/* Preview webcam */}
                    {testi.webcam.esito === 'ok' && (
                        <div className="mb-5 rounded-xl overflow-hidden"
                            style={{ border: '1px solid rgba(34,197,94,0.3)', maxWidth: 300 }}>
                            <video ref={videoRef} autoPlay muted playsInline
                                className="w-full" style={{ display: 'block' }} />
                        </div>
                    )}

                    {/* Ultimo collaudo */}
                    {ultimo_collaudo && (
                        <div className="mb-5 rounded-lg px-4 py-3 text-xs"
                            style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: '#5c6380' }}>
                            Ultimo collaudo: {ultimo_collaudo.created_at} —{' '}
                            <span style={{
                                color: ultimo_collaudo.esito === 'superato' ? '#22c55e'
                                    : ultimo_collaudo.esito === 'parziale'  ? '#f59e0b'
                                    : '#ef4444',
                            }}>
                                {ultimo_collaudo.esito}
                            </span>
                        </div>
                    )}

                    {/* Griglia test */}
                    <div className="space-y-3">
                        <TestRow
                            label="Webcam"
                            categoria="browser"
                            stato={testi.webcam}
                            descrizione="Verifica accesso fotocamera via browser."
                            onEsegui={testWebcam}
                        />
                        <TestRow
                            label="Microfono"
                            categoria="browser"
                            stato={testi.microfono}
                            descrizione="Verifica accesso microfono via browser."
                            onEsegui={testMicrofono}
                        />
                        <TestRow
                            label="Altoparlante / Audio"
                            categoria="browser"
                            stato={testi.audio}
                            descrizione="Riproduce un tono 440 Hz — ascoltare per verificare."
                            onEsegui={testAudio}
                        />
                        <TestRow
                            label="Schermo intero"
                            categoria="browser"
                            stato={testi.fullscreen}
                            descrizione="Verifica supporto Fullscreen API per modalità kiosk."
                            onEsegui={testFullscreen}
                        />
                        <TestRow
                            label="Terminale POS"
                            categoria="hardware"
                            stato={testi.pos}
                            descrizione="Richiede kiosk-agent installato. Segnare manualmente dopo verifica fisica."
                            onToggleHardware={chiosco.has_pos ? () => toggleHardware('pos') : undefined}
                        />
                        <TestRow
                            label="Stampante"
                            categoria="hardware"
                            stato={testi.stampante}
                            descrizione="Richiede kiosk-agent installato. Segnare manualmente dopo verifica fisica."
                            onToggleHardware={chiosco.has_stampante ? () => toggleHardware('stampante') : undefined}
                        />
                    </div>
                </div>

                {/* Footer azioni */}
                <div className="shrink-0 px-6 py-4 flex items-center justify-between"
                    style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <p className="text-xs" style={{ color: '#5c6380' }}>
                        {tuttiEseguiti
                            ? 'Tutti i test completati — salvare i risultati.'
                            : 'Eseguire tutti i test prima di salvare.'}
                    </p>
                    <button
                        onClick={salvaRisultati}
                        disabled={! tuttiEseguiti || fase === 'invio'}
                        className="px-6 py-2.5 rounded-xl text-sm font-medium transition-opacity"
                        style={{
                            backgroundColor: tuttiEseguiti && fase !== 'invio' ? '#3b82f6' : 'rgba(59,130,246,0.3)',
                            color:           '#fff',
                            cursor:          tuttiEseguiti && fase !== 'invio' ? 'pointer' : 'default',
                        }}>
                        {fase === 'invio' ? 'Salvataggio…' : 'Salva risultati collaudo'}
                    </button>
                </div>
            </div>
        </KioskLayout>
    );
}

// ── Riga test ─────────────────────────────────────────────────────────────────

function TestRow({
    label, categoria, stato, descrizione, onEsegui, onToggleHardware,
}: {
    label:              string;
    categoria:          'browser' | 'hardware';
    stato:              StatoTest;
    descrizione:        string;
    onEsegui?:          () => void;
    onToggleHardware?:  () => void;
}) {
    const { esito, dettaglio } = stato;

    const esitoColor: Record<EsitoSingolo, string> = {
        non_testato:   '#5c6380',
        in_corso:      '#eab308',
        ok:            '#22c55e',
        ko:            '#ef4444',
        non_richiesto: '#3a3f52',
    };

    const esitoLabel: Record<EsitoSingolo, string> = {
        non_testato:   'Da eseguire',
        in_corso:      'In corso…',
        ok:            '✓ OK',
        ko:            '✗ Fallito',
        non_richiesto: 'N/A',
    };

    const isPending = esito === 'non_testato' || esito === 'non_richiesto';

    return (
        <div className="rounded-xl px-5 py-4 flex items-center justify-between gap-4"
            style={{
                backgroundColor: 'rgba(255,255,255,0.03)',
                border:          `1px solid ${esito === 'ok' ? 'rgba(34,197,94,0.2)' : esito === 'ko' ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
            }}>
            {/* Sinistra: info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium" style={{ color: '#e8eaf2' }}>{label}</span>
                    <span className="rounded px-1.5 py-0.5 text-xs font-mono"
                        style={{
                            color:           categoria === 'browser' ? '#60a5fa' : '#a78bfa',
                            backgroundColor: categoria === 'browser' ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)',
                            border:          `1px solid ${categoria === 'browser' ? 'rgba(96,165,250,0.25)' : 'rgba(167,139,250,0.25)'}`,
                        }}>
                        {categoria === 'browser' ? 'Browser' : 'Hardware'}
                    </span>
                </div>
                <p className="text-xs" style={{ color: '#5c6380' }}>{descrizione}</p>
                {dettaglio && (
                    <p className="text-xs mt-1" style={{ color: esito === 'ko' ? '#ef4444' : '#9ba3c0' }}>
                        {dettaglio}
                    </p>
                )}
            </div>

            {/* Destra: stato + azione */}
            <div className="flex items-center gap-3 shrink-0">
                <span className="text-sm font-medium" style={{ color: esitoColor[esito] }}>
                    {esitoLabel[esito]}
                </span>

                {categoria === 'browser' && onEsegui && esito !== 'non_richiesto' && (
                    <button
                        onClick={onEsegui}
                        disabled={esito === 'in_corso'}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                            backgroundColor: esito === 'in_corso' ? 'rgba(234,179,8,0.15)' : 'rgba(59,130,246,0.15)',
                            color:           esito === 'in_corso' ? '#eab308' : '#60a5fa',
                            border:          `1px solid ${esito === 'in_corso' ? 'rgba(234,179,8,0.3)' : 'rgba(59,130,246,0.3)'}`,
                            cursor:          esito === 'in_corso' ? 'default' : 'pointer',
                        }}>
                        {esito === 'ok' ? 'Riesegui' : esito === 'in_corso' ? 'In corso…' : 'Esegui test'}
                    </button>
                )}

                {categoria === 'hardware' && onToggleHardware && esito !== 'non_richiesto' && (
                    <button
                        onClick={onToggleHardware}
                        className="px-4 py-1.5 rounded-lg text-xs font-medium"
                        style={{
                            backgroundColor: esito === 'ok'  ? 'rgba(34,197,94,0.15)'
                                            : esito === 'ko' ? 'rgba(239,68,68,0.15)'
                                            : 'rgba(255,255,255,0.06)',
                            color:           esito === 'ok'  ? '#22c55e'
                                            : esito === 'ko' ? '#ef4444'
                                            : '#9ba3c0',
                            border:          `1px solid ${esito === 'ok' ? 'rgba(34,197,94,0.3)' : esito === 'ko' ? 'rgba(239,68,68,0.3)' : 'rgba(255,255,255,0.12)'}`,
                            cursor: 'pointer',
                        }}>
                        {esito === 'ok' ? '✓ Verificato — cambia' : esito === 'ko' ? '✗ Non ok — cambia' : 'Segnare esito'}
                    </button>
                )}

                {esito === 'non_richiesto' && (
                    <span className="text-xs px-3 py-1.5 rounded-lg"
                        style={{ backgroundColor: 'rgba(255,255,255,0.03)', color: '#3a3f52', border: '1px solid rgba(255,255,255,0.04)' }}>
                        Non richiesto
                    </span>
                )}
            </div>
        </div>
    );
}
