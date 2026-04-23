import { useState, useCallback, useMemo } from 'react';
import { Head, usePage } from '@inertiajs/react';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import ChioscoCard from '@/Components/Portineria/ChioscoCard';
import AreaVideo from '@/Components/Portineria/AreaVideo';
import MessaggioAttesaModal from '@/Components/Portineria/MessaggioAttesaModal';
import { usePortineriaRealtime, usePortineriaPolling, StatoAggiornato } from '@/hooks/usePortineriaRealtime';
import { cambiaStato, demoSimula, demoReset } from '@/services/portineriaApi';
import { ChioscoConStato, StatoChiosco, SharedProps } from '@/types';

interface Props {
    chioschi:      ChioscoConStato[];
    hotel_ids:     string[];
    puoInteragire: boolean;
}

export default function PortineriaIndex({ chioschi: chioschiIniziali, hotel_ids, puoInteragire }: Props) {
    const { auth } = usePage<SharedProps>().props;
    const profilo = auth.utente?.profilo ?? 'receptionist_lite';

    // ── Stato locale chioschi (aggiornato da Reverb / polling / azioni) ──
    const [chioschi, setChioschi] = useState<ChioscoConStato[]>(chioschiIniziali);
    const [selezioneId, setSelezioneId] = useState<string | null>(null);
    const [modalMessaggio, setModalMessaggio] = useState(false);
    const [msgLoading, setMsgLoading] = useState(false);
    const [bannerDemo, setBannerDemo] = useState(false);

    // ── Chiosco selezionato (derivato) ───────────────────────────────────
    const chioscoSelezionato = useMemo(
        () => chioschi.find((c) => c.id === selezioneId) ?? null,
        [chioschi, selezioneId],
    );

    // ── Aggiornamento stato da evento realtime ────────────────────────────
    const handleStatoCambiato = useCallback((update: StatoAggiornato) => {
        setChioschi((prev) =>
            prev.map((c) =>
                c.id === update.chiosco_id
                    ? { ...c, stato: update.stato, messaggio_attesa: update.messaggio ?? c.messaggio_attesa }
                    : c,
            ),
        );

        // Auto-focus: se arriva una chiamata in arrivo e nessun chiosco è selezionato,
        // seleziona automaticamente il chiosco che sta chiamando.
        // Non sovrascrive una selezione già attiva — il receptionist gestisce la situazione.
        if (update.stato === 'in_chiamata') {
            setSelezioneId((prev) => prev ?? update.chiosco_id);
        }
    }, []);

    // ── Realtime (Reverb) ─────────────────────────────────────────────────
    const { realtimeAttivo } = usePortineriaRealtime({
        hotelIds:        hotel_ids,
        onStatoCambiato: handleStatoCambiato,
    });

    // ── Polling fallback (se Reverb non è attivo) ─────────────────────────
    usePortineriaPolling(
        realtimeAttivo ? [] : chioschi.map((c) => c.id),
        handleStatoCambiato,
        5000,
    );

    // ── Callback: stato cambiato da azione utente (AreaVideo) ─────────────
    const handleStatoChanged = useCallback(
        (chioscoId: string, stato: StatoChiosco, messaggio?: string | null) => {
            setChioschi((prev) =>
                prev.map((c) =>
                    c.id === chioscoId
                        ? { ...c, stato, messaggio_attesa: messaggio !== undefined ? messaggio : c.messaggio_attesa }
                        : c,
                ),
            );
        },
        [],
    );

    // ── Messaggio attesa ──────────────────────────────────────────────────
    const handleConfermaMessaggio = async (testo: string) => {
        if (!chioscoSelezionato) return;
        setMsgLoading(true);
        const res = await cambiaStato(chioscoSelezionato.id, 'messaggio_attesa', testo);
        setMsgLoading(false);
        if (res.ok) {
            handleStatoChanged(chioscoSelezionato.id, 'messaggio_attesa', testo);
            setModalMessaggio(false);
        }
    };

    // ── Click su card chiosco ─────────────────────────────────────────────
    const handleCardClick = useCallback((id: string) => {
        setSelezioneId((prev) => (prev === id ? null : id));
    }, []);

    // ── Demo toolbar ──────────────────────────────────────────────────────
    const DEMO_STATI: { label: string; stato: StatoChiosco; color: string }[] = [
        { label: 'Idle',      stato: 'idle',             color: '#22c55e' },
        { label: 'Chiamata',  stato: 'in_chiamata',      color: '#ef4444' },
        { label: 'Chiaro',    stato: 'in_chiaro',        color: '#22c55e' },
        { label: 'Nascosto',  stato: 'in_nascosto',      color: '#eab308' },
        { label: 'Msg Att.',  stato: 'messaggio_attesa', color: '#9ba3c0' },
        { label: 'Offline',   stato: 'offline',          color: '#5c6380' },
    ];

    const handleDemoSimula = async (stato: StatoChiosco) => {
        const target = chioscoSelezionato ?? chioschi[0];
        if (!target) return;
        const res = await demoSimula(target.id, stato);
        if (res.ok) handleStatoChanged(target.id, stato);
    };

    const handleDemoReset = async () => {
        await demoReset();
        setChioschi((prev) => prev.map((c) => ({ ...c, stato: 'idle' as StatoChiosco, messaggio_attesa: null })));
    };

    // ── Conteggio badge header ────────────────────────────────────────────
    const chioschiAttivi   = chioschi.filter((c) => !['offline', 'idle'].includes(c.stato)).length;
    const chioschiChiamata = chioschi.filter((c) => c.stato === 'in_chiamata').length;

    // Limite sessioni concorrenti: minimo tra gli hotel presenti (coerente con il backend).
    // 0 = nessun limite configurato.
    const concorrentiMax = useMemo(() => {
        const valori = chioschi
            .map((c) => c.hotel?.chioschi_concorrenti_max)
            .filter((v): v is number => typeof v === 'number' && v > 0);
        return valori.length > 0 ? Math.min(...valori) : 0;
    }, [chioschi]);

    return (
        <ReceptionistLayout>
            <Head title="Portineria" />

            {/* Contenitore flex-col per propagare altezza: header(48px) + banner + [demo] + split */}
            <div className="flex flex-col h-full">

            {/* ── Banner stato realtime ── */}
            <div
                className="flex items-center justify-between px-4 py-1.5 shrink-0"
                style={{
                    backgroundColor: realtimeAttivo ? 'rgba(34,197,94,0.05)' : 'rgba(234,179,8,0.06)',
                    borderBottom:    '1px solid ' + (realtimeAttivo ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.2)'),
                    fontSize:        '11px',
                }}
            >
                <div className="flex items-center gap-3">
                    <span style={{ color: realtimeAttivo ? '#22c55e' : '#eab308' }}>
                        ● {realtimeAttivo ? 'Realtime attivo' : 'Modalità demo — polling 5s'}
                    </span>
                    {chioschiChiamata > 0 && (
                        <span className="animate-blink font-semibold" style={{ color: '#ef4444' }}>
                            ⚡ {chioschiChiamata} chiamata{chioschiChiamata > 1 ? 'e' : ''} in arrivo
                        </span>
                    )}
                    {chioschiAttivi > 0 && chioschiChiamata === 0 && (
                        <span style={{
                            color: concorrentiMax > 0 && chioschiAttivi >= concorrentiMax
                                ? '#f59e0b'
                                : 'var(--color-text-muted)',
                        }}>
                            {concorrentiMax > 0
                                ? `${chioschiAttivi}/${concorrentiMax} connession${chioschiAttivi !== 1 ? 'i' : 'e'} attiv${chioschiAttivi !== 1 ? 'e' : 'a'}`
                                : `${chioschiAttivi} connession${chioschiAttivi !== 1 ? 'i' : 'e'} attiv${chioschiAttivi !== 1 ? 'e' : 'a'}`
                            }
                        </span>
                    )}
                </div>

                {/* Demo toolbar toggle */}
                <div className="flex items-center gap-2">
                    <span style={{ color: '#5c6380' }}>
                        {chioschi.length} chiosco{chioschi.length !== 1 ? 'i' : ''}
                        {' · '}
                        {hotel_ids.length} hotel
                    </span>
                    <button
                        onClick={() => setBannerDemo((v) => !v)}
                        className="rounded px-2 py-0.5 font-mono"
                        style={{
                            fontSize: '10px',
                            color: '#5c6380',
                            border: '1px solid #2e3348',
                        }}
                    >
                        DEMO {bannerDemo ? '▲' : '▼'}
                    </button>
                </div>
            </div>

            {/* ── Demo toolbar (solo APP_ENV=local) ── */}
            {bannerDemo && (
                <div
                    className="flex items-center gap-2 px-4 py-2 shrink-0 flex-wrap"
                    style={{
                        backgroundColor: '#0d1020',
                        borderBottom:    '1px solid #2e3348',
                        fontSize:        '11px',
                    }}
                >
                    <span style={{ color: '#5c6380' }}>
                        Demo: imposta stato su {chioscoSelezionato?.nome ?? chioschi[0]?.nome ?? '—'}
                    </span>
                    {DEMO_STATI.map(({ label, stato, color }) => (
                        <button
                            key={stato}
                            onClick={() => handleDemoSimula(stato)}
                            className="rounded px-2 py-0.5 font-mono transition-colors"
                            style={{
                                fontSize:        '10px',
                                color:           color,
                                border:          `1px solid ${color}50`,
                                backgroundColor: `${color}10`,
                            }}
                        >
                            {label}
                        </button>
                    ))}
                    <button
                        onClick={handleDemoReset}
                        className="rounded px-2 py-0.5 font-mono ml-auto"
                        style={{ fontSize: '10px', color: '#5c6380', border: '1px solid #2e3348' }}
                    >
                        Reset tutti
                    </button>
                </div>
            )}

            {/* ── Layout split principale ── */}
            <div className="flex flex-1 overflow-hidden min-h-0">

                {/* Area video — sinistra 55% */}
                <div className="shrink-0 border-r" style={{ width: '55%', borderColor: 'var(--color-border)' }}>
                    <AreaVideo
                        chiosco={chioscoSelezionato}
                        profilo={profilo}
                        onStatoChanged={handleStatoChanged}
                        onApriMessaggio={() => setModalMessaggio(true)}
                    />
                </div>

                {/* Griglia chioschi — destra 45% */}
                <div className="flex-1 overflow-auto" style={{ backgroundColor: 'var(--color-bg-primary)' }}>
                    {chioschi.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-sm"
                             style={{ color: 'var(--color-text-muted)' }}>
                            Nessun chiosco configurato per questo hotel.
                        </div>
                    ) : (
                        <GrigliaChioschi
                            chioschi={chioschi}
                            selezioneId={selezioneId}
                            puoInteragire={puoInteragire}
                            onCardClick={handleCardClick}
                        />
                    )}
                </div>
            </div>

            {/* Modal messaggio attesa */}
            <MessaggioAttesaModal
                isOpen={modalMessaggio}
                messaggioCorrente={chioscoSelezionato?.messaggio_attesa ?? null}
                nomeChiosco={chioscoSelezionato?.nome ?? ''}
                onConferma={handleConfermaMessaggio}
                onAnnulla={() => setModalMessaggio(false)}
                isLoading={msgLoading}
            />

            </div>{/* fine flex-col h-full */}
        </ReceptionistLayout>
    );
}

// ── Griglia chioschi ───────────────────────────────────────────────────────

interface GrigliaProps {
    chioschi:      ChioscoConStato[];
    selezioneId:   string | null;
    puoInteragire: boolean;
    onCardClick:   (id: string) => void;
}

function GrigliaChioschi({ chioschi, selezioneId, puoInteragire, onCardClick }: GrigliaProps) {
    // Raggruppa per hotel
    const perHotel = chioschi.reduce<Record<string, ChioscoConStato[]>>((acc, c) => {
        const nomeHotel = c.hotel?.nome ?? c.hotel_id;
        if (!acc[nomeHotel]) acc[nomeHotel] = [];
        acc[nomeHotel].push(c);
        return acc;
    }, {});

    const mostraHeader = Object.keys(perHotel).length > 1;

    return (
        <div className="p-3">
            {Object.entries(perHotel).map(([nomeHotel, lista]) => (
                <div key={nomeHotel} className="mb-4">
                    {mostraHeader && (
                        <div className="text-xs uppercase tracking-widest mb-2 px-1 font-semibold"
                             style={{ color: '#5c6380', letterSpacing: '0.08em' }}>
                            {nomeHotel}
                        </div>
                    )}
                    <div className="grid gap-2.5" style={{
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                    }}>
                        {lista.map((chiosco) => (
                            <ChioscoCard
                                key={chiosco.id}
                                chiosco={chiosco}
                                isSelezionato={chiosco.id === selezioneId}
                                puoInteragire={puoInteragire}
                                onClick={() => onCardClick(chiosco.id)}
                            />
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
