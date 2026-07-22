import { useCallback, useEffect, useRef, useState } from 'react';
import { Head, router } from '@inertiajs/react';
import KioskLayout from '@/Layouts/KioskLayout';
import { Chiosco, StatoChiosco } from '@/types';
import { useLiveKitChiosco } from '@/hooks/useLiveKitChiosco';
import { useKioskHeartbeat } from '@/hooks/useKioskHeartbeat';
import { useKioskStato } from '@/hooks/useKioskStato';
import { useKioskAcquisizione } from '@/hooks/useKioskAcquisizione';
import { useKioskStampa } from '@/hooks/useKioskStampa';
import { annullaChiamata, avviaSessioneAi, terminaSessioneAi, uploadDocumentoAcquisito, annullaAcquisizione, getDocumentoPerStampa, segnalaStampaCompletata, annullaStampa, segnalaEsitoPagamento, annullaPagamento } from '@/services/kioskApi';
import { useKioskPagamento } from '@/hooks/useKioskPagamento';
import type { ErroreMedia } from '@/services/webrtcMedia';

interface Props {
    chiosco:          Chiosco;
    stato_iniziale:   StatoChiosco;
    messaggio_attesa: string | null;
}

/**
 * Schermata Kiosk — profilo CHIOSCO, fullscreen.
 *
 * Routing visivo basato su stato Portineria:
 *   idle          → AttesoScreen (touch per chiamare / simula campanello)
 *   in_chiamata   → ChiamataInCorsoScreen (attesa risposta receptionist)
 *   in_chiaro     → CollegamentoChiaroScreen (video bidirezionale)
 *   in_nascosto   → AttesoScreen (guest non sa — monitoraggio silenzioso)
 *   in_parlato    → ParlatoScreen (audio+video)
 *   messaggio_attesa → MessaggioAttesaScreen (testo dal receptionist)
 *   offline       → OfflineScreen
 */
export default function KioskIndex({ chiosco, stato_iniziale, messaggio_attesa: messaggioIniziale }: Props) {
    // ── Heartbeat — invia presenza al server ogni 60s ───────────────────────
    useKioskHeartbeat();

    // ── Stato runtime Portineria ────────────────────────────────────────────
    const { stato, messaggioAttesa } = useKioskStato({
        chioscoId:         chiosco.id,
        statoIniziale:     stato_iniziale,
        messaggioIniziale,
    });

    // ── Acquisizione documento ──────────────────────────────────────────────
    const { acquisizione } = useKioskAcquisizione();

    // ── Stampa remota ───────────────────────────────────────────────────────
    const { stampa } = useKioskStampa();

    // ── Pagamento POS remoto ────────────────────────────────────────────────
    const { pagamento } = useKioskPagamento();

    // ── Media: chiaro / nascosto / parlato tutti su LiveKit ─────────────────
    const lk = useLiveKitChiosco();

    // Routing — usa il sessionTipo riportato dall'hook LiveKit
    const inAi      = stato === 'in_parlato' && lk.sessionTipo === 'parlato' && lk.gestitaDa === 'ai';
    const inParlato = stato === 'in_parlato' && lk.sessionTipo === 'parlato' && ! inAi;
    const inChiaro  = stato === 'in_chiaro'  && lk.sessionTipo === 'chiaro';

    // ── Handler annullo chiamata (stato in_chiamata raggiungibile da demo) ──
    const handleAnnullaChiamata = async () => {
        await annullaChiamata();
    };

    // ── Handler self check-in / check-out AI ────────────────────────────────
    type ScopoAi = 'checkin' | 'checkout' | 'info';
    const [aiLoading, setAiLoading] = useState<ScopoAi | null>(null);
    const [aiScopo,   setAiScopo]   = useState<ScopoAi>('checkin');
    const [aiErrore,  setAiErrore]  = useState<string | null>(null);

    const handleAvviaAi = async (scopo: ScopoAi) => {
        if (aiLoading || stato !== 'idle') return;
        setAiLoading(scopo);
        setAiErrore(null);
        const res = await avviaSessioneAi(scopo);
        if (! res.ok) setAiErrore(res.error ?? "L'assistente non è disponibile.");
        else setAiScopo(scopo);
        setAiLoading(null);
        // Lo stato passa a in_parlato via Reverb/polling; il media si aggancia
        // col normale polling del token LiveKit (gestita_da='ai' → AiScreen).
    };

    const handleTerminaAi = async () => {
        await terminaSessioneAi();
    };

    // ── Schermata finale: il riepilogo resta visibile dopo la sessione AI ───
    // aiUi si azzera alla disconnessione → se ne conserva una copia mentre la
    // sessione è viva; alla chiusura con esito utile la si mostra per 45s.
    const ultimoAiRef = useRef<{ ui: typeof lk.aiUi; scopo: ScopoAi } | null>(null);
    const [fineSessione, setFineSessione] = useState<{ ui: typeof lk.aiUi; scopo: ScopoAi } | null>(null);
    const eraInAi = useRef(false);
    useEffect(() => {
        if (inAi) {
            ultimoAiRef.current = { ui: lk.aiUi, scopo: aiScopo };
            eraInAi.current = true;
            return;
        }
        if (eraInAi.current) {
            eraInAi.current = false;
            const u = ultimoAiRef.current;
            const utile = u && (u.ui.codice || u.ui.pagamento?.stato === 'ok');
            if (utile) {
                setFineSessione(u);
                const t = setTimeout(() => setFineSessione(null), 45_000);
                return () => clearTimeout(t);
            }
        }
    }, [inAi, lk.aiUi, aiScopo]);

    // ── Rendering condizionale per stato ───────────────────────────────────
    return (
        <KioskLayout>
            <Head title="Chiosco" />

            {/* Pagamento POS remoto — priorità massima, non interrompe video attivi */}
            {pagamento && ! inParlato && ! inChiaro ? (
                <PagamentoPOSScreen
                    chiosco={chiosco}
                    importo={pagamento.importo}
                    valuta={pagamento.valuta}
                    causale={pagamento.causale}
                    tipoPOS={pagamento.tipo_pos}
                />
            ) : stampa && ! inParlato && ! inChiaro && ! acquisizione ? (
                <StampaScreen
                    chiosco={chiosco}
                    titolo={stampa.titolo}
                />
            ) : acquisizione && ! inParlato && ! inChiaro ? (
                <AcquisizioneScreen
                    chiosco={chiosco}
                    titolo={acquisizione.titolo}
                    fronteRetro={acquisizione.fronte_retro}
                    onCompletata={annullaAcquisizione}
                    onAnnulla={annullaAcquisizione}
                />
            ) : inAi ? (
                <AiScreen
                    scopo={aiScopo}
                    statoMedia={lk.stato}
                    localVideoRef={lk.localVideoRef}
                    aiUi={lk.aiUi}
                    audioTrack={lk.remoteAudioTrack}
                    onTermina={handleTerminaAi}
                />
            ) : inParlato ? (
                <ParlatoScreen
                    chiosco={chiosco}
                    localVideoRef={lk.localVideoRef}
                    remoteVideoRef={lk.remoteVideoRef}
                    stato={lk.stato}
                    errore={lk.errore}
                    condivisioneAttiva={lk.condivisioneAttiva}
                    grigliaDoc={lk.grigliaDoc}
                    inAttesa={lk.inAttesa}
                    messaggioAttesa={lk.messaggioAttesa}
                />
            ) : inChiaro ? (
                /* Chiaro: video bidirezionale, no audio (LiveKit) */
                <CollegamentoChiaroScreen
                    chiosco={chiosco}
                    localVideoRef={lk.localVideoRef}
                    remoteVideoRef={lk.remoteVideoRef}
                    stato={lk.stato}
                    condivisioneAttiva={lk.condivisioneAttiva}
                    grigliaDoc={lk.grigliaDoc}
                    inAttesa={lk.inAttesa}
                    messaggioAttesa={lk.messaggioAttesa}
                />
            ) : stato === 'in_chiamata' ? (
                /* Chiamata in corso: attesa risposta receptionist */
                <ChiamataInCorsoScreen
                    chiosco={chiosco}
                    onAnnulla={handleAnnullaChiamata}
                />
            ) : stato === 'messaggio_attesa' ? (
                /* Messaggio attesa impostato dal receptionist */
                <MessaggioAttesaScreen
                    chiosco={chiosco}
                    messaggio={messaggioAttesa}
                />
            ) : stato === 'offline' ? (
                /* Chiosco offline */
                <OfflineScreen chiosco={chiosco} />
            ) : fineSessione ? (
                /* Riepilogo finale dopo la sessione AI: codice/camera restano leggibili */
                <CompletatoScreen
                    dati={fineSessione.ui}
                    scopo={fineSessione.scopo}
                    onChiudi={() => setFineSessione(null)}
                />
            ) : (
                /* idle / in_nascosto (guest non sa) / stati sconosciuti → schermata attesa */
                <AttesoScreen
                    chiosco={chiosco}
                    onAvviaAi={handleAvviaAi}
                    aiLoading={aiLoading}
                    aiErrore={aiErrore}
                />
            )}
        </KioskLayout>
    );
}

// ── PagamentoPOSScreen ────────────────────────────────────────────────────────
// Mostrata quando il receptionist ha richiesto un pagamento POS.
//
// NOTA ARCHITETTURALE (adapter mock onesto):
// L'integrazione hardware POS reale (Ingenico/MyPOS) richiede un layer nativo
// (Electron, app locale o middleware) che legga/scriva i file path_input_pos /
// path_output_pos. Dal browser non è possibile accedere al filesystem del kiosk.
//
// Questa schermata presenta importo e causale, e fornisce pulsanti manuali per
// simulare l'esito. In un'integrazione completa, il layer nativo leggerebbe il
// file di risposta POS e chiamerebbe segnalaEsitoPagamento() automaticamente.

interface PagamentoPOSScreenProps {
    chiosco:  Chiosco;
    importo:  number;
    valuta:   string;
    causale:  string | null;
    tipoPOS:  string;
}

type FasePagamento = 'attesa' | 'elaborazione' | 'ok' | 'ko' | 'annullato';

function PagamentoPOSScreen({ chiosco, importo, valuta, causale, tipoPOS }: PagamentoPOSScreenProps) {
    const [fase,       setFase]       = useState<FasePagamento>('attesa');
    const [elaborando, setElaborando] = useState(false);

    const handleEsito = async (esito: 'ok' | 'ko' | 'annullato') => {
        if (elaborando) return;
        setElaborando(true);
        setFase('elaborazione');

        const result = await segnalaEsitoPagamento(
            esito,
            esito === 'ok' ? importo : undefined,
        );

        if (result.ok) {
            setFase(esito);
        } else {
            // In caso di errore di rete: continua a mostrare la schermata
            // — il polling del chiosco riprenderà al prossimo ciclo.
            setFase('attesa');
        }
        setElaborando(false);
    };

    const handleAnnullaGuest = async () => {
        if (elaborando) return;
        setElaborando(true);
        await annullaPagamento();
        setFase('annullato');
        setElaborando(false);
    };

    const simboloValuta = valuta === 'EUR' ? '€' : valuta;

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: fase === 'ok' ? '#22c55e' : fase === 'ko' ? '#ef4444' : '#10b981' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Pagamento POS
                    </span>
                    <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono uppercase"
                        style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                        {tipoPOS}
                    </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">

                {/* ── In attesa / elaborazione ── */}
                {(fase === 'attesa' || fase === 'elaborazione') && (
                    <>
                        {/* Importo */}
                        <div className="flex flex-col items-center gap-3">
                            <div className="rounded-2xl px-10 py-6 text-center"
                                style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <p className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    Importo da pagare
                                </p>
                                <p className="text-5xl font-light" style={{ color: '#10b981', letterSpacing: '-0.02em' }}>
                                    {simboloValuta} {importo.toFixed(2)}
                                </p>
                                {causale && (
                                    <p className="text-base mt-3" style={{ color: 'var(--color-text-secondary)' }}>
                                        {causale}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Istruzione POS */}
                        <div className="text-center space-y-2">
                            <div className="flex items-center justify-center mb-4">
                                <div className="rounded-2xl flex items-center justify-center"
                                    style={{ width: 80, height: 80, backgroundColor: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.2">
                                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                                        <line x1="1" y1="10" x2="23" y2="10"/>
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xl font-light" style={{ color: 'var(--color-text-primary)' }}>
                                Avvicinare la carta al POS
                            </p>
                            <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                                Tap or insert your card on the POS terminal
                            </p>
                        </div>

                        {/* Mock POS — pulsanti manuali (DEV o sempre in assenza di HW) */}
                        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                            <p className="text-xs font-mono uppercase tracking-widest mb-1"
                                style={{ color: 'rgba(255,255,255,0.2)' }}>
                                {import.meta.env.DEV ? '[DEV] Simula esito POS' : 'Seleziona esito'}
                            </p>
                            <div className="flex items-center gap-4 w-full">
                                <button
                                    onClick={() => handleEsito('ok')}
                                    disabled={elaborando}
                                    className="flex-1 rounded-xl py-3 text-sm font-medium transition-all active:scale-95"
                                    style={{
                                        backgroundColor: elaborando ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.1)',
                                        border:          '1px solid rgba(34,197,94,0.4)',
                                        color:           '#22c55e',
                                        cursor:          elaborando ? 'default' : 'pointer',
                                    }}>
                                    Pagamento riuscito
                                </button>
                                <button
                                    onClick={() => handleEsito('ko')}
                                    disabled={elaborando}
                                    className="flex-1 rounded-xl py-3 text-sm font-medium transition-all active:scale-95"
                                    style={{
                                        backgroundColor: elaborando ? 'rgba(239,68,68,0.04)' : 'rgba(239,68,68,0.08)',
                                        border:          '1px solid rgba(239,68,68,0.3)',
                                        color:           '#ef4444',
                                        cursor:          elaborando ? 'default' : 'pointer',
                                    }}>
                                    Rifiutato
                                </button>
                            </div>
                            <button
                                onClick={handleAnnullaGuest}
                                disabled={elaborando}
                                className="rounded-xl px-6 py-2 text-sm"
                                style={{
                                    color:           'var(--color-text-muted)',
                                    border:          '1px solid var(--color-border)',
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    cursor:          elaborando ? 'default' : 'pointer',
                                }}>
                                Annulla
                            </button>
                        </div>

                        {/* Spinner elaborazione */}
                        {fase === 'elaborazione' && (
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                                    style={{ borderColor: 'rgba(16,185,129,0.3)', borderTopColor: '#10b981' }} />
                                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                    Comunicazione con il server…
                                </span>
                            </div>
                        )}
                    </>
                )}

                {/* ── Esito OK ── */}
                {fase === 'ok' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(34,197,94,0.1)', border: '3px solid rgba(34,197,94,0.4)' }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-3xl font-light" style={{ color: '#22c55e' }}>
                                {simboloValuta} {importo.toFixed(2)}
                            </p>
                            <p className="text-xl font-light mt-2" style={{ color: 'var(--color-text-primary)' }}>
                                Pagamento completato
                            </p>
                            <p className="text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Payment successful
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Esito KO ── */}
                {fase === 'ko' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(239,68,68,0.08)', border: '3px solid rgba(239,68,68,0.35)' }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xl font-light" style={{ color: '#ef4444' }}>
                                Pagamento non riuscito
                            </p>
                            <p className="text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Carta rifiutata o operazione non completata
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Payment declined
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Annullato ── */}
                {fase === 'annullato' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(92,99,128,0.08)', border: '2px solid var(--color-border)' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xl font-light" style={{ color: 'var(--color-text-muted)' }}>
                                Operazione annullata
                            </p>
                            <p className="text-sm mt-1" style={{ color: '#3a3f55' }}>
                                Payment cancelled
                            </p>
                        </div>
                    </div>
                )}

                {import.meta.env.DEV && (
                    <div className="absolute bottom-3 left-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {chiosco.nome} · pagamento_pos · {fase}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── StampaScreen ─────────────────────────────────────────────────────────────
// Mostrata quando il receptionist ha richiesto la stampa di un documento.
// Il kiosk scarica il file, lo apre in un iframe nascosto e chiama window.print().
// Segnala l'esito (ok o errore) via POST /kiosk/stampe/completata.
//
// NOTA ARCHITETTURALE:
// window.print() mostra il dialog di stampa nativo del browser.
// Non è possibile verificare se l'utente ha effettivamente cliccato "Stampa" nel dialog.
// Il segnale "ok" = "dialog di stampa mostrato con successo".

interface StampaScreenProps {
    chiosco: Chiosco;
    titolo:  string | null;
}

type FaseStampa = 'download' | 'stampa' | 'completata' | 'errore';

function StampaScreen({ chiosco, titolo }: StampaScreenProps) {
    const [fase,   setFase]   = useState<FaseStampa>('download');
    const [errore, setErrore] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        let blobUrl: string | null = null;
        let iframe: HTMLIFrameElement | null = null;

        const esegui = async () => {
            // 1. Scarica il documento dal server
            const blob = await getDocumentoPerStampa();
            if (! mountedRef.current) return;

            if (! blob) {
                setFase('errore');
                setErrore('Impossibile scaricare il documento dal server.');
                await segnalaStampaCompletata('errore', 'Download fallito');
                return;
            }

            blobUrl = URL.createObjectURL(blob);
            setFase('stampa');

            // 2. Carica in iframe nascosto e chiama print()
            iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;';
            iframe.src = blobUrl;

            const onLoad = async () => {
                if (! mountedRef.current) return;
                try {
                    iframe!.contentWindow?.print();
                    // Il dialog è mostrato: segnala ok
                    // Aspetta brevemente per dare tempo al dialog di aprirsi
                    setTimeout(async () => {
                        if (! mountedRef.current) return;
                        if (blobUrl) URL.revokeObjectURL(blobUrl);
                        document.body.removeChild(iframe!);
                        await segnalaStampaCompletata('ok');
                        if (mountedRef.current) setFase('completata');
                    }, 800);
                } catch (err) {
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(iframe!);
                    const msg = 'Il browser non supporta la stampa automatica per questo tipo di file.';
                    await segnalaStampaCompletata('errore', msg);
                    if (mountedRef.current) { setFase('errore'); setErrore(msg); }
                }
            };

            const onError = async () => {
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                if (iframe && document.body.contains(iframe)) document.body.removeChild(iframe);
                const msg = 'Impossibile caricare il documento nell\'iframe.';
                await segnalaStampaCompletata('errore', msg);
                if (mountedRef.current) { setFase('errore'); setErrore(msg); }
            };

            iframe.addEventListener('load', onLoad, { once: true });
            iframe.addEventListener('error', onError, { once: true });
            document.body.appendChild(iframe);
        };

        esegui();

        return () => {
            mountedRef.current = false;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            if (iframe && document.body.contains(iframe)) {
                try { document.body.removeChild(iframe); } catch { /* ignore */ }
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Eseguito una sola volta al montaggio

    const handleAnnullaStampa = async () => {
        await annullaStampa();
        // La rimozione dello stato avverrà al prossimo poll
    };

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: fase === 'errore' ? '#ef4444' : fase === 'completata' ? '#22c55e' : '#7c3aed' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {fase === 'download'  ? 'Download documento…'
                         : fase === 'stampa'  ? 'Stampa in corso'
                         : fase === 'completata' ? 'Stampa completata'
                         : 'Errore stampa'}
                    </span>
                    {titolo && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono"
                            style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.25)' }}>
                            {titolo}
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6">

                {/* Download / stampa in corso */}
                {(fase === 'download' || fase === 'stampa') && (
                    <>
                        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                            <div className="absolute inset-0 rounded-full animate-pulse"
                                style={{ backgroundColor: 'rgba(124,58,237,0.08)', border: '2px solid rgba(124,58,237,0.3)' }} />
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
                                <polyline points="6 9 6 2 18 2 18 9"/>
                                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                                <rect x="6" y="14" width="12" height="8"/>
                            </svg>
                        </div>
                        <div className="text-center">
                            <p className="text-xl font-light mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                {fase === 'download' ? 'Preparazione documento…' : 'Stampa in corso…'}
                            </p>
                            <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                                {fase === 'download' ? 'Download in corso' : 'Il dialog di stampa si aprirà a breve'}
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                {fase === 'stampa' ? 'Printing document…' : 'Downloading…'}
                            </p>
                        </div>
                        {fase === 'stampa' && (
                            <button onClick={handleAnnullaStampa}
                                className="rounded-xl px-6 py-2 text-sm"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                Annulla
                            </button>
                        )}
                    </>
                )}

                {/* Completata */}
                {fase === 'completata' && (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 80, height: 80, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <p className="text-xl font-light" style={{ color: '#22c55e' }}>Stampa completata</p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Print completed
                        </p>
                    </div>
                )}

                {/* Errore */}
                {fase === 'errore' && (
                    <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 72, height: 72, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-light" style={{ color: '#ef4444' }}>Errore stampa</p>
                            {errore && (
                                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{errore}</p>
                            )}
                        </div>
                    </div>
                )}

                {import.meta.env.DEV && (
                    <div className="absolute bottom-3 left-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {chiosco.nome} · stampa · {fase}
                    </div>
                )}
            </div>
        </div>
    );
}

// ── AcquisizioneScreen ───────────────────────────────────────────────────────
// Mostrata quando il receptionist ha inviato una richiesta di acquisizione.
// Il guest inquadra il documento, cattura l'immagine tramite webcam e la invia.

interface AcquisizioneScreenProps {
    chiosco:       Chiosco;
    titolo:        string | null;
    fronteRetro:   boolean;
    onCompletata:  () => void;
    onAnnulla:     () => void;
}

type FaseAcquisizione = 'preview' | 'uploading' | 'completata' | 'errore';
type LatoAcquisizione = 'fronte' | 'retro';

function AcquisizioneScreen({ chiosco, titolo, fronteRetro, onCompletata, onAnnulla }: AcquisizioneScreenProps) {
    const videoRef   = useRef<HTMLVideoElement>(null);
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const streamRef  = useRef<MediaStream | null>(null);
    const mountedRef = useRef(true);

    const [fase,    setFase]    = useState<FaseAcquisizione>('preview');
    const [errore,  setErrore]  = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<string | null>(null);
    const [lato,    setLato]    = useState<LatoAcquisizione>(fronteRetro ? 'fronte' : 'fronte');

    // Avvio webcam
    useEffect(() => {
        mountedRef.current = true;
        let stream: MediaStream | null = null;

        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            .then(s => {
                if (! mountedRef.current) { s.getTracks().forEach(t => t.stop()); return; }
                stream = s;
                streamRef.current = s;
                if (videoRef.current) {
                    videoRef.current.srcObject = s;
                    videoRef.current.play().catch(() => {});
                }
            })
            .catch(() => {
                if (mountedRef.current) {
                    setFase('errore');
                    setErrore('Impossibile accedere alla webcam. Verificare le autorizzazioni del browser.');
                }
            });

        return () => {
            mountedRef.current = false;
            if (stream) stream.getTracks().forEach(t => t.stop());
            else if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    // Cattura frame dalla webcam
    const handleCattura = useCallback(() => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (! video || ! canvas) return;

        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (! ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setSnapshot(dataUrl);
    }, []);

    // Conferma e upload
    const handleInvia = useCallback(async () => {
        const canvas = canvasRef.current;
        if (! canvas) return;

        setFase('uploading');
        canvas.toBlob(async (blob) => {
            if (! blob) { setFase('errore'); setErrore('Errore nella creazione dell\'immagine.'); return; }

            const isLastStep = !fronteRetro || lato === 'retro';
            const result = await uploadDocumentoAcquisito(blob, fronteRetro ? {
                lato,
                parziale: lato === 'fronte',
            } : undefined);

            if (! mountedRef.current) return;
            if (result.ok) {
                if (isLastStep) {
                    setFase('completata');
                    streamRef.current?.getTracks().forEach(t => t.stop());
                    setTimeout(() => { if (mountedRef.current) onCompletata(); }, 2_000);
                } else {
                    // Fronte inviato, passa al retro
                    setLato('retro');
                    setSnapshot(null);
                    setFase('preview');
                }
            } else {
                setFase('errore');
                setErrore(result.errore ?? 'Errore upload');
            }
        }, 'image/jpeg', 0.92);
    }, [onCompletata, fronteRetro, lato]);

    const handleRiprendi = () => {
        setSnapshot(null);
        setFase('preview');
        setErrore(null);
    };

    const handleAnnullaGuest = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        await onAnnulla();
    };

    const latoLabel    = fronteRetro ? (lato === 'fronte' ? 'FRONTE' : 'RETRO') : null;
    const stepLabel    = fronteRetro ? (lato === 'fronte' ? '1/2' : '2/2') : null;
    const confirmLabel = fronteRetro && lato === 'fronte' ? 'Conferma fronte' : 'Invia documento';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Acquisizione documento
                    </span>
                    {titolo && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono"
                            style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }}>
                            {titolo}
                        </span>
                    )}
                    {latoLabel && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono uppercase"
                            style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                            {latoLabel} ({stepLabel})
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">

                {/* Preview / snapshot */}
                {(fase === 'preview' || fase === 'uploading') && (
                    <div className="relative rounded-2xl overflow-hidden shadow-2xl"
                        style={{ width: '480px', maxWidth: '90vw', aspectRatio: '4/3',
                                 backgroundColor: 'var(--color-bg-primary)', border: '2px solid rgba(59,130,246,0.3)' }}>
                        {/* Video live */}
                        <video ref={videoRef} autoPlay playsInline muted
                            className="w-full h-full object-cover"
                            style={{ display: snapshot ? 'none' : 'block' }} />
                        {/* Snapshot catturato */}
                        {snapshot && (
                            <img src={snapshot} alt="Documento catturato"
                                className="w-full h-full object-contain" />
                        )}
                        {/* Canvas nascosto per cattura */}
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                        {/* Indicatore live */}
                        {! snapshot && (
                            <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
                                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#ef4444' }} />
                                <span className="text-xs" style={{ color: '#fff', fontSize: '10px' }}>LIVE</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Completata */}
                {fase === 'completata' && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 80, height: 80, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <p className="text-xl font-light" style={{ color: '#22c55e' }}>
                            {fronteRetro ? 'Documento acquisito (fronte e retro)' : 'Documento acquisito'}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Document acquired successfully
                        </p>
                    </div>
                )}

                {/* Errore */}
                {fase === 'errore' && (
                    <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 72, height: 72, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-light" style={{ color: '#ef4444' }}>Errore</p>
                            {errore && (
                                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{errore}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Istruzioni e controlli */}
                {fase === 'preview' && ! snapshot && (
                    <div className="text-center space-y-2">
                        <p className="text-base font-light" style={{ color: 'var(--color-text-primary)' }}>
                            {fronteRetro
                                ? (lato === 'fronte'
                                    ? <>Inquadrare il <strong>fronte</strong> del documento e premere <strong>Cattura</strong></>
                                    : <>Inquadrare il <strong>retro</strong> del documento e premere <strong>Cattura</strong></>)
                                : <>Inquadrare il documento e premere <strong>Cattura</strong></>
                            }
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            {fronteRetro
                                ? (lato === 'fronte'
                                    ? <>Frame the <strong>front</strong> of your document and tap <strong>Capture</strong></>
                                    : <>Frame the <strong>back</strong> of your document and tap <strong>Capture</strong></>)
                                : <>Frame your document and tap <strong>Capture</strong></>
                            }
                        </p>
                    </div>
                )}
                {fase === 'preview' && snapshot && (
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Verificare l'immagine. Se corretta, premere <strong>{fronteRetro && lato === 'fronte' ? 'Conferma fronte' : 'Invia'}</strong>.
                    </p>
                )}

                {/* Pulsanti azione */}
                <div className="flex items-center gap-4">
                    {fase === 'preview' && ! snapshot && (
                        <>
                            <button onClick={handleAnnullaGuest}
                                className="rounded-xl px-6 py-3 text-sm"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                Annulla
                            </button>
                            <button onClick={handleCattura}
                                className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                                style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                Cattura
                            </button>
                        </>
                    )}
                    {fase === 'preview' && snapshot && (
                        <>
                            <button onClick={handleRiprendi}
                                className="rounded-xl px-6 py-3 text-sm"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                Riprendi
                            </button>
                            <button onClick={handleInvia}
                                className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                                style={{ backgroundColor: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                {confirmLabel}
                            </button>
                        </>
                    )}
                    {fase === 'uploading' && (
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                                style={{ borderColor: 'rgba(34,197,94,0.4)', borderTopColor: '#22c55e' }} />
                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Caricamento…</span>
                        </div>
                    )}
                    {fase === 'errore' && (
                        <button onClick={handleAnnullaGuest}
                            className="rounded-xl px-6 py-3 text-sm"
                            style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                            Chiudi
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── AiScreen ─────────────────────────────────────────────────────────────────
// Sessione vocale con il receptionist AI (self check-in o informazioni).
// Nessun avatar: indicatore vocale al centro, autoritratto camera in basso.
// La reception vede/ascolta già la conversazione in nascosto e può intervenire.

interface AiScreenProps {
    scopo:         'checkin' | 'checkout' | 'info';
    statoMedia:    'idle' | 'connecting' | 'connected' | 'error';
    localVideoRef: React.RefObject<HTMLVideoElement | null>;
    aiUi:          import('@/hooks/useLiveKitChiosco').AiUiState;
    audioTrack:    MediaStreamTrack | null;
    onTermina:     () => void;
}

/** Riga del recap live: etichetta + valore, flash animato a ogni aggiornamento.
    Dimensioni pensate per un totem letto a 1-2 metri di distanza. */
function RecapRiga({ label, value }: { label: string; value: string | null }) {
    const ok = value !== null && value !== '';
    return (
        <div className="flex items-center justify-between gap-4 py-3"
             style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
            <span className="shrink-0" style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>{label}</span>
            {/* key={value}: rimonta al cambio → riparte l'animazione di ingresso */}
            <span key={value ?? 'vuoto'}
                  className={`flex items-center gap-2 text-right font-medium px-1.5 ${ok ? 'ai-field-in' : ''}`}
                  style={{ fontSize: 19, color: ok ? 'var(--color-text-primary)' : 'rgba(148,163,184,0.35)' }}>
                {ok ? value : '—'}
                {ok && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5">
                        <path d="M20 6L9 17l-5-5" />
                    </svg>
                )}
            </span>
        </div>
    );
}

/**
 * Stepper di fase del processo (dalla FSM dell'agent): mostra all'ospite
 * a che punto è il check-in/out. Discreto, sotto il titolo del recap.
 */
function FaseStepper({ fase, scopo }: { fase: string | null; scopo: 'checkin' | 'checkout' | 'info' }) {
    const passi: { chiavi: string[]; label: string }[] = scopo === 'checkout'
        ? [
            { chiavi: ['ricerca'],   label: 'Ricerca' },
            { chiavi: ['trovata'],   label: 'Prenotazione' },
            { chiavi: ['pagamento'], label: 'Pagamento' },
            { chiavi: ['congedo'],   label: 'Fine' },
        ]
        : [
            { chiavi: ['accoglienza', 'dati'], label: 'Dati' },
            { chiavi: ['conferma'],            label: 'Conferma' },
            { chiavi: ['salvata', 'camera'],   label: 'Camera' },
            { chiavi: ['documento'],           label: 'Documento' },
            { chiavi: ['congedo'],             label: 'Fine' },
        ];
    const idxCorrente = Math.max(0, passi.findIndex((p) => p.chiavi.includes(fase ?? '')));

    return (
        <div className="flex items-center gap-1.5 mb-4">
            {passi.map((p, i) => {
                const fatto    = i < idxCorrente;
                const corrente = i === idxCorrente;
                return (
                    <div key={p.label} className="flex items-center gap-1.5 flex-1">
                        <div className="flex flex-col items-center gap-1 flex-1">
                            <div className="w-full rounded-full transition-all duration-500"
                                 style={{ height: 4,
                                          backgroundColor: fatto ? '#22c55e' : corrente ? '#3b82f6' : 'rgba(148,163,184,0.2)' }} />
                            <span className="text-[10px] uppercase tracking-wide transition-colors duration-500"
                                  style={{ color: fatto ? '#4ade80' : corrente ? '#93c5fd' : 'rgba(148,163,184,0.4)',
                                           fontWeight: corrente ? 700 : 400 }}>
                                {p.label}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

/**
 * Opzioni camera proposte dall'AI: l'ospite le vede con prezzo e
 * caratteristiche mentre l'assistente le descrive, e sceglie a voce.
 */
function CamereOpzioniPanel({ opzioni }: { opzioni: import('@/hooks/useLiveKitChiosco').CameraOpzione[] }) {
    return (
        <div className="ai-pop-in mt-5">
            <div className="flex items-center justify-between mb-2">
                <p className="text-xs uppercase tracking-widest" style={{ color: '#93c5fd' }}>
                    Camere disponibili
                </p>
                <p className="text-[11px]" style={{ color: 'rgba(148,163,184,0.7)' }}>
                    scegli a voce
                </p>
            </div>
            <div className="space-y-2 pr-1"
                 style={{ maxHeight: '34vh', overflowY: 'auto', scrollbarWidth: 'thin' }}>
                {opzioni.map((o) => (
                    <div key={o.camera_id} className="rounded-xl py-3 px-4 flex items-center justify-between gap-3"
                         style={{ backgroundColor: 'rgba(30,58,138,0.45)', border: '1px solid rgba(96,165,250,0.55)' }}>
                        <div className="min-w-0">
                            <p className="font-bold truncate" style={{ fontSize: 17, color: '#ffffff' }}>
                                {o.tipo}
                                {o.quante_simili > 1 && (
                                    <span className="font-normal" style={{ fontSize: 12, color: 'rgba(219,234,254,0.75)' }}>
                                        {' '}×{o.quante_simili}
                                    </span>
                                )}
                            </p>
                            <p className="truncate" style={{ fontSize: 13, color: '#bfdbfe' }}>
                                {o.descrizione
                                    ? o.descrizione
                                    : `Piano ${o.piano} · ${o.posti} post${o.posti === 1 ? 'o' : 'i'}`}
                            </p>
                        </div>
                        <div className="text-right shrink-0" style={{ minWidth: 100 }}>
                            {o.prezzo_notte !== null ? (
                                <>
                                    <p className="font-bold leading-tight" style={{ fontSize: 19, color: '#ffffff' }}>
                                        € {Number(o.prezzo_notte).toFixed(0)}
                                        <span className="font-normal" style={{ fontSize: 11, color: '#bfdbfe' }}> /notte</span>
                                    </p>
                                    {o.prezzo_totale !== null && (
                                        <p className="leading-tight" style={{ fontSize: 12, color: '#bfdbfe' }}>
                                            € {Number(o.prezzo_totale).toFixed(0)} totale
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p style={{ fontSize: 12, color: '#bfdbfe' }}>prezzo in reception</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            {opzioni.length > 4 && (
                <p className="text-center mt-1.5" style={{ fontSize: 11, color: 'rgba(148,163,184,0.55)' }}>
                    scorri per vedere tutte le {opzioni.length} opzioni
                </p>
            )}
        </div>
    );
}

/**
 * Riepilogo finale del check-in: appare dopo la lettura del documento, con
 * il nome UFFICIALE dell'intestatario, soggiorno, camera e codice.
 */
function RiepilogoFinalePanel({ r }: { r: import('@/hooks/useLiveKitChiosco').RiepilogoFinale }) {
    const dataIt = (iso?: string | null) => iso
        ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
        : null;
    const ospiti = r.adulti
        ? `${r.adulti} adult${r.adulti === 1 ? 'o' : 'i'}`
            + (r.ragazzi ? `, ${r.ragazzi} ragazz${r.ragazzi === 1 ? 'o' : 'i'}` : '')
            + (r.bambini ? `, ${r.bambini} bambin${r.bambini === 1 ? 'o' : 'i'}` : '')
        : null;

    const Riga = ({ label, value }: { label: string; value: string | null }) => (
        value ? (
            <div className="flex items-center justify-between gap-4 py-3"
                 style={{ borderBottom: '1px solid rgba(148,163,184,0.12)' }}>
                <span className="shrink-0" style={{ fontSize: 15, color: 'var(--color-text-muted)' }}>{label}</span>
                <span className="text-right font-medium" style={{ fontSize: 19, color: 'var(--color-text-primary)' }}>
                    {value}
                </span>
            </div>
        ) : null
    );

    return (
        <div className="ai-pop-in">
            <p className="text-xs uppercase tracking-widest mb-3" style={{ color: '#4ade80' }}>
                Riepilogo del check-in
            </p>
            <Riga label="Ospite"    value={r.nome && r.cognome ? `${r.nome} ${r.cognome}` : (r.nome ?? r.cognome ?? null)} />
            <Riga label="Ospiti"    value={ospiti} />
            <Riga label="Arrivo"    value={dataIt(r.check_in)} />
            <Riga label="Partenza"  value={dataIt(r.check_out)} />
            <Riga label="Camera"    value={r.camera ? `${r.camera}${r.piano !== null && r.piano !== undefined ? ` · piano ${r.piano}` : ''}` : null} />
            {r.codice && (
                <div className="mt-5 rounded-xl py-4 px-5 text-center"
                     style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.45)' }}>
                    <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>
                        Codice prenotazione
                    </p>
                    <p className="font-mono font-bold" style={{ fontSize: 30, letterSpacing: '0.12em', color: '#86efac' }}>
                        {r.codice}
                    </p>
                </div>
            )}
        </div>
    );
}

/**
 * Equalizer audio-reattivo: 5 barre che seguono la voce dell'AI in tempo reale
 * (WebAudio AnalyserNode sulla track remota). Manipola il DOM direttamente
 * via ref — niente re-render React a 60fps.
 */
function VoceEqualizer({ track }: { track: MediaStreamTrack | null }) {
    const barsRef = useRef<(HTMLDivElement | null)[]>([]);

    useEffect(() => {
        if (!track) return;
        const ctx = new AudioContext();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.75;
        const src = ctx.createMediaStreamSource(new MediaStream([track]));
        src.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        let raf = 0;
        const loop = () => {
            analyser.getByteFrequencyData(data);
            // 5 bande: media di fasce diverse dello spettro (voce ≈ bande basse/medie)
            const bande = [
                [1, 3], [3, 6], [6, 10], [10, 16], [16, 24],
            ].map(([a, b]) => {
                let s = 0;
                for (let i = a; i < b; i++) s += data[i];
                return s / (b - a) / 255;
            });
            barsRef.current.forEach((el, i) => {
                if (el) el.style.height = `${8 + Math.min(1, bande[i] * 1.6) * 30}px`;
            });
            raf = requestAnimationFrame(loop);
        };
        loop();

        return () => {
            cancelAnimationFrame(raf);
            src.disconnect();
            ctx.close().catch(() => {});
        };
    }, [track]);

    return (
        <div className="flex items-center justify-center gap-1.5" style={{ height: 40 }}>
            {[0, 1, 2, 3, 4].map((i) => (
                <div key={i} ref={(el) => { barsRef.current[i] = el; }}
                     className="ai-eq-bar" style={{ width: 5, height: 8 }} />
            ))}
        </div>
    );
}

function AiScreen({ scopo, statoMedia, localVideoRef, aiUi, audioTrack, onTermina }: AiScreenProps) {
    const connesso = statoMedia === 'connected';
    const titolo   = scopo === 'checkin' ? 'Check-in con l’assistente'
        : scopo === 'checkout' ? 'Check-out' : 'Informazioni';

    // "Sta scrivendo…": puntini animati sul recap per ~1.6s dopo ogni aggiornamento
    const [scrivendo, setScrivendo] = useState(false);
    const primaRender = useRef(true);
    useEffect(() => {
        if (primaRender.current) { primaRender.current = false; return; }
        setScrivendo(true);
        const t = setTimeout(() => setScrivendo(false), 1600);
        return () => clearTimeout(t);
    }, [aiUi]);

    const dataIt = (iso?: string) => iso
        ? new Date(iso + 'T00:00:00').toLocaleDateString('it-IT', { day: 'numeric', month: 'long' })
        : null;
    const f = aiUi.form;
    const ospiti = f.adulti
        ? `${f.adulti} adult${f.adulti === 1 ? 'o' : 'i'}`
            + (f.ragazzi ? `, ${f.ragazzi} ragazz${f.ragazzi === 1 ? 'o' : 'i'}` : '')
            + (f.bambini ? `, ${f.bambini} bambin${f.bambini === 1 ? 'o' : 'i'}` : '')
        : null;
    const cameraTxt = aiUi.camera?.nome
        ? `Camera ${aiUi.camera.nome}` + (aiUi.camera.piano !== null && aiUi.camera.piano !== undefined ? ` · piano ${aiUi.camera.piano}` : '')
        : null;
    const mostraRecap = scopo !== 'info';
    const pag = aiUi.pagamento;

    return (
        <div className="ai-screen-layout">
            {/* Colonna sinistra: orb vocale audio-reattivo */}
            <div className="flex flex-col items-center shrink-0">
                <div className="relative flex items-center justify-center mb-8" style={{ width: 180, height: 180 }}>
                    {/* Alone conico rotante */}
                    {connesso && <div className="ai-orb-halo absolute rounded-full" style={{ width: 150, height: 150 }} />}
                    <div className="ai-orb-core rounded-full flex items-center justify-center relative"
                         style={{ width: 104, height: 104,
                                  background: 'radial-gradient(circle at 35% 30%, rgba(96,165,250,0.40), rgba(30,41,80,0.85))',
                                  border: '1px solid rgba(96,165,250,0.55)',
                                  boxShadow: '0 0 40px rgba(59,130,246,0.25), inset 0 0 24px rgba(59,130,246,0.15)' }}>
                        {connesso
                            ? <VoceEqualizer track={audioTrack} />
                            : (
                                <span className="flex gap-1.5">
                                    <span className="ai-dot w-2 h-2 rounded-full" style={{ backgroundColor: '#93c5fd' }} />
                                    <span className="ai-dot w-2 h-2 rounded-full" style={{ backgroundColor: '#93c5fd' }} />
                                    <span className="ai-dot w-2 h-2 rounded-full" style={{ backgroundColor: '#93c5fd' }} />
                                </span>
                            )}
                    </div>
                </div>

                <h1 className="font-light mb-2 text-center" style={{ fontSize: 28, color: 'var(--color-text-primary)' }}>{titolo}</h1>
                <p className="text-base text-center" style={{ color: connesso ? '#93c5fd' : 'var(--color-text-muted)' }}>
                    {connesso ? 'Parla pure — l’assistente ti ascolta' : 'Connessione in corso…'}
                </p>
                <p className="text-xs mt-2 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Un receptionist può intervenire in ogni momento.
                </p>
            </div>

            {/* Colonna destra: recap live di quello che dici */}
            {mostraRecap && (
                <div className="ai-recap-card rounded-2xl p-7"
                     style={{ backgroundColor: 'rgba(148,163,184,0.05)',
                              border: '1px solid rgba(148,163,184,0.18)' }}>
                    <FaseStepper fase={aiUi.fase} scopo={scopo} />
                    {scopo === 'checkin' && aiUi.riepilogo ? (
                        /* Pagina finale: nome ufficiale dal documento + tutto il soggiorno */
                        <RiepilogoFinalePanel r={aiUi.riepilogo} />
                    ) : (<>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-xs uppercase tracking-widest" style={{ color: 'var(--color-text-muted)' }}>
                            {scopo === 'checkout' ? 'Il tuo check-out' : 'La tua prenotazione'}
                        </p>
                        {scrivendo && (
                            <span className="flex items-center gap-1">
                                <span className="ai-dot w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#60a5fa' }} />
                                <span className="ai-dot w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#60a5fa' }} />
                                <span className="ai-dot w-1.5 h-1.5 rounded-full" style={{ backgroundColor: '#60a5fa' }} />
                            </span>
                        )}
                    </div>
                    {/* Il nome NON si mostra durante il flusso: quello ufficiale
                        arriva dal documento e compare nel riepilogo finale. */}
                    {scopo === 'checkout' && (
                        <RecapRiga label="Nome" value={f.nome && f.cognome ? `${f.nome} ${f.cognome}` : f.nome ?? f.cognome ?? null} />
                    )}
                    <RecapRiga label="Arrivo"   value={dataIt(f.check_in)} />
                    <RecapRiga label="Partenza" value={dataIt(f.check_out)} />
                    {scopo === 'checkin' && <RecapRiga label="Ospiti" value={ospiti} />}
                    <RecapRiga label="Camera"   value={cameraTxt} />

                    {/* Scelta camera: opzioni con prezzo e caratteristiche */}
                    {scopo === 'checkin' && aiUi.camereOpzioni && aiUi.camereOpzioni.length > 0 && (
                        <CamereOpzioniPanel opzioni={aiUi.camereOpzioni} />
                    )}

                    {/* Pagamento POS (check-out) */}
                    {pag?.importo !== undefined && (
                        <div className="ai-pop-in mt-5 rounded-xl py-3.5 px-5 flex items-center justify-between"
                             style={{
                                 backgroundColor: pag.stato === 'ok' ? 'rgba(34,197,94,0.10)' : pag.stato === 'ko' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                                 border: `1px solid ${pag.stato === 'ok' ? 'rgba(34,197,94,0.45)' : pag.stato === 'ko' ? 'rgba(239,68,68,0.4)' : 'rgba(245,158,11,0.4)'}`,
                             }}>
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Pagamento</span>
                            <span className="font-semibold" style={{ fontSize: 18,
                                  color: pag.stato === 'ok' ? '#86efac' : pag.stato === 'ko' ? '#fca5a5' : '#fcd34d' }}>
                                € {Number(pag.importo).toFixed(2)}{' '}
                                {pag.stato === 'ok' ? '· Pagato ✓' : pag.stato === 'ko' ? '· Non riuscito' : '· Segui il POS'}
                            </span>
                        </div>
                    )}

                    {/* Codice prenotazione — grande (per il check-in arriva col riepilogo) */}
                    {scopo === 'checkout' && aiUi.codice && (
                        <div className="ai-pop-in mt-5 rounded-xl py-4 px-5 text-center"
                             style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.45)' }}>
                            <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>
                                Codice prenotazione
                            </p>
                            <p className="font-mono font-bold" style={{ fontSize: 30, letterSpacing: '0.12em', color: '#86efac' }}>
                                {aiUi.codice}
                            </p>
                        </div>
                    )}
                    </>)}
                </div>
            )}

            {/* Autoritratto camera — sempre attiva, in basso a destra */}
            <video ref={localVideoRef} autoPlay muted playsInline
                   className="absolute rounded-xl"
                   style={{ right: 20, bottom: 20, width: 170, height: 128, objectFit: 'cover',
                            backgroundColor: '#060810', border: '1px solid var(--color-border)', transform: 'scaleX(-1)' }} />

            {/* Termina — discreto ma con bersaglio touch da totem */}
            <button onClick={onTermina}
                    className="absolute rounded-xl px-8 py-4 transition-all active:scale-95"
                    style={{ left: 24, bottom: 24, fontSize: 16, color: '#ef4444',
                             border: '1px solid rgba(239,68,68,0.35)', minHeight: 56 }}>
                Termina conversazione
            </button>
        </div>
    );
}

// ── CompletatoScreen ─────────────────────────────────────────────────────────
// Riepilogo finale dopo la sessione AI: codice e camera restano leggibili
// (45s o finché l'ospite tocca Chiudi), senza sparire con la chiusura audio.

interface CompletatoScreenProps {
    dati:     import('@/hooks/useLiveKitChiosco').AiUiState;
    scopo:    'checkin' | 'checkout' | 'info';
    onChiudi: () => void;
}

function CompletatoScreen({ dati, scopo, onChiudi }: CompletatoScreenProps) {
    const checkout = scopo === 'checkout';
    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-8">
            <div className="rounded-full flex items-center justify-center mb-6"
                 style={{ width: 84, height: 84, backgroundColor: 'rgba(34,197,94,0.10)', border: '2px solid rgba(34,197,94,0.5)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                </svg>
            </div>
            <h1 className="font-light mb-2" style={{ fontSize: 34, color: 'var(--color-text-primary)' }}>
                {checkout ? 'Check-out completato' : 'Check-in completato'}
            </h1>
            <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>
                {checkout ? 'Grazie del soggiorno — buon viaggio!' : 'Benvenuto — buon soggiorno!'}
            </p>

            <div className="flex items-stretch gap-4 mb-10 flex-wrap justify-center">
                {dati.codice && (
                    <div className="rounded-xl py-4 px-8 text-center"
                         style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.45)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>Codice prenotazione</p>
                        <p className="font-mono font-bold" style={{ fontSize: 32, letterSpacing: '0.12em', color: '#86efac' }}>{dati.codice}</p>
                    </div>
                )}
                {!checkout && dati.camera?.nome && (
                    <div className="rounded-xl py-4 px-8 text-center"
                         style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.4)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#93c5fd' }}>La tua camera</p>
                        <p className="font-bold" style={{ fontSize: 32, color: '#bfdbfe' }}>
                            {dati.camera.nome}
                            {dati.camera.piano !== null && dati.camera.piano !== undefined && (
                                <span className="font-normal" style={{ fontSize: 15, color: '#93c5fd' }}> · piano {dati.camera.piano}</span>
                            )}
                        </p>
                    </div>
                )}
                {checkout && dati.pagamento?.stato === 'ok' && dati.pagamento.importo !== undefined && (
                    <div className="rounded-xl py-4 px-8 text-center"
                         style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.45)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>Pagamento</p>
                        <p className="font-bold" style={{ fontSize: 32, color: '#86efac' }}>€ {Number(dati.pagamento.importo).toFixed(2)} ✓</p>
                    </div>
                )}
            </div>

            <button onClick={onChiudi}
                    className="rounded-xl px-8 py-3 text-sm transition-all active:scale-95"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Chiudi
            </button>
        </div>
    );
}

// ── AttesoScreen ─────────────────────────────────────────────────────────────
// Mostrata in idle e in_nascosto (monitoraggio silenzioso: il guest non sa nulla).

interface AttesoScreenProps {
    chiosco:   Chiosco;
    onAvviaAi: (scopo: 'checkin' | 'checkout' | 'info') => void;
    aiLoading: 'checkin' | 'checkout' | 'info' | null;
    aiErrore:  string | null;
}

function AttesoScreen({ chiosco, onAvviaAi, aiLoading, aiErrore }: AttesoScreenProps) {
    const handleLogout = () => {
        if (confirm('Disconnettere il chiosco?')) {
            router.post('/logout');
        }
    };

    return (
        <>
            {/* Indicatore connessione — top left */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs z-10">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-ok)' }} />
                <span style={{ color: 'var(--color-text-muted)' }}>Connesso</span>
            </div>

            {/* Logout — top right, discreto */}
            <button
                onClick={handleLogout}
                className="absolute top-3 right-3 z-10 rounded p-1.5 transition-opacity"
                style={{ color: 'var(--color-text-muted)', opacity: 0.3 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.3')}
                title="Disconnetti chiosco"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
            </button>

            {/* Area principale */}
            <div className="w-full h-full flex flex-col items-center justify-center">
                {/* Benvenuto */}
                <div className="text-center mb-10 px-8">
                    <h1 className="font-light mb-2" style={{ fontSize: 40, color: 'var(--color-text-primary)' }}>
                        Benvenuto
                    </h1>
                    <p style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>
                        Welcome · Tocca un pulsante per iniziare
                    </p>
                </div>

                {/* Self check-in / check-out AI — azioni principali del chiosco */}
                <div className="flex items-stretch justify-center gap-5 mb-8 px-8 w-full" style={{ maxWidth: 1020 }}>
                    <button
                        onClick={() => onAvviaAi('checkin')}
                        disabled={aiLoading !== null}
                        className="flex-1 rounded-2xl transition-all active:scale-95"
                        style={{
                            padding:    '26px 32px',
                            background: aiLoading === 'checkin'
                                ? 'rgba(59,130,246,0.10)'
                                : 'linear-gradient(180deg, rgba(59,130,246,0.22), rgba(59,130,246,0.10))',
                            border:     '2px solid rgba(59,130,246,0.55)',
                            cursor:     aiLoading ? 'default' : 'pointer',
                            boxShadow:  '0 8px 30px rgba(59,130,246,0.15)',
                        }}
                    >
                        <div className="flex flex-col items-center gap-2.5">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.5">
                                <path d="M9 12l2 2 4-4" />
                                <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-xl font-medium" style={{ color: '#93c5fd' }}>
                                {aiLoading === 'checkin' ? 'Un attimo…' : 'Esegui il check-in'}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Self check-in</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onAvviaAi('checkout')}
                        disabled={aiLoading !== null}
                        className="flex-1 rounded-2xl transition-all active:scale-95"
                        style={{
                            padding:    '26px 32px',
                            background: aiLoading === 'checkout'
                                ? 'rgba(245,158,11,0.08)'
                                : 'linear-gradient(180deg, rgba(245,158,11,0.18), rgba(245,158,11,0.08))',
                            border:     '2px solid rgba(245,158,11,0.5)',
                            cursor:     aiLoading ? 'default' : 'pointer',
                        }}
                    >
                        <div className="flex flex-col items-center gap-2.5">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.5">
                                <rect x="2" y="5" width="20" height="14" rx="2" />
                                <path d="M2 10h20" />
                            </svg>
                            <span className="text-xl font-medium" style={{ color: '#fcd34d' }}>
                                {aiLoading === 'checkout' ? 'Un attimo…' : 'Esegui il check-out'}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Check-out &amp; payment</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onAvviaAi('info')}
                        disabled={aiLoading !== null}
                        className="flex-1 rounded-2xl transition-all active:scale-95"
                        style={{
                            padding:         '26px 32px',
                            backgroundColor: aiLoading === 'info' ? 'rgba(148,163,184,0.06)' : 'rgba(148,163,184,0.08)',
                            border:          '2px solid rgba(148,163,184,0.35)',
                            cursor:          aiLoading ? 'default' : 'pointer',
                        }}
                    >
                        <div className="flex flex-col items-center gap-2.5">
                            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 16v-4M12 8h.01" />
                            </svg>
                            <span className="text-xl font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                {aiLoading === 'info' ? 'Un attimo…' : 'Richiedi informazioni'}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Ask for information</span>
                        </div>
                    </button>
                </div>

                {aiErrore && (
                    <p className="mb-6 text-sm rounded-lg px-4 py-2"
                       style={{ color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.07)' }}>
                        {aiErrore}
                    </p>
                )}

            </div>

            {/* Info chiosco — bottom left, solo dev */}
            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · {chiosco.tipo}
                </div>
            )}
        </>
    );
}

// ── ChiamataInCorsoScreen ────────────────────────────────────────────────────
// Il guest ha chiamato — attende che il receptionist risponda.

interface ChiamataInCorsoScreenProps {
    chiosco:   Chiosco;
    onAnnulla: () => void;
}

function ChiamataInCorsoScreen({ chiosco, onAnnulla }: ChiamataInCorsoScreenProps) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-8">

            {/* Cerchi animati pulsanti */}
            <div className="relative flex items-center justify-center"
                 style={{ width: 120, height: 120 }}>
                <div className="absolute inset-0 rounded-full animate-pulse-ring"
                     style={{ border: '2px solid rgba(34,197,94,0.5)', opacity: 0.6 }} />
                <div className="absolute inset-0 rounded-full animate-pulse-ring"
                     style={{ border: '2px solid rgba(34,197,94,0.3)', opacity: 0.3, animationDelay: '0.5s' }} />
                <div className="absolute inset-0 rounded-full animate-pulse-ring"
                     style={{ border: '2px solid rgba(34,197,94,0.15)', opacity: 0.15, animationDelay: '1s' }} />
                <div className="absolute inset-0 rounded-full flex items-center justify-center"
                     style={{
                         backgroundColor: 'rgba(34,197,94,0.12)',
                         border:          '2px solid rgba(34,197,94,0.5)',
                     }}>
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="#22c55e" className="animate-blink">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                    </svg>
                </div>
            </div>

            {/* Testo */}
            <div className="text-center px-8">
                <p className="text-2xl font-light mb-2" style={{ color: 'var(--color-text-primary)' }}>
                    Chiamata in corso…
                </p>
                <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                    In attesa di risposta dal receptionist
                </p>
                <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    Waiting for reception to answer
                </p>
            </div>

            {/* Annulla — solo touch (per analogico non ha senso) */}
            {chiosco.tipo === 'touch' && (
                <button
                    onClick={onAnnulla}
                    className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                    style={{
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        border:          '1px solid rgba(239,68,68,0.3)',
                        color:           '#ef4444',
                        cursor:          'pointer',
                    }}
                >
                    Annulla chiamata
                </button>
            )}

            {/* Info — bottom left, solo dev */}
            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · in_chiamata
                </div>
            )}
        </div>
    );
}

// ── MessaggioAttesaScreen ────────────────────────────────────────────────────
// Il receptionist ha impostato un messaggio di attesa.

interface MessaggioAttesaScreenProps {
    chiosco:  Chiosco;
    messaggio: string | null;
}

function MessaggioAttesaScreen({ chiosco, messaggio }: MessaggioAttesaScreenProps) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-8 px-8">

            {/* Icona messaggio */}
            <div className="rounded-full flex items-center justify-center"
                 style={{
                     width:           80,
                     height:          80,
                     backgroundColor: 'rgba(155,163,192,0.08)',
                     border:          '2px solid rgba(155,163,192,0.3)',
                 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                     stroke="#9ba3c0" strokeWidth="1.5">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                </svg>
            </div>

            {/* Messaggio */}
            <div className="text-center max-w-lg">
                <p className="text-sm uppercase tracking-widest mb-4"
                   style={{ color: 'var(--color-text-muted)', letterSpacing: '0.12em' }}>
                    Messaggio del receptionist
                </p>

                {messaggio ? (
                    <p className="text-xl font-light leading-relaxed"
                       style={{ color: 'var(--color-text-primary)', lineHeight: 1.6 }}>
                        {messaggio}
                    </p>
                ) : (
                    <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                        Il receptionist tornerà disponibile a breve.
                    </p>
                )}

                <p className="text-sm mt-6" style={{ color: 'var(--color-text-muted)' }}>
                    Reception will be available shortly.
                </p>
            </div>

            {/* Info — bottom left, solo dev */}
            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · messaggio_attesa
                </div>
            )}
        </div>
    );
}

// ── OfflineScreen ────────────────────────────────────────────────────────────

function OfflineScreen({ chiosco }: { chiosco: Chiosco }) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-6">
            <div className="rounded-full flex items-center justify-center"
                 style={{
                     width:           72,
                     height:          72,
                     backgroundColor: 'rgba(92,99,128,0.08)',
                     border:          '2px solid var(--color-border)',
                 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                    <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
            </div>
            <div className="text-center">
                <p className="text-lg font-light" style={{ color: 'var(--color-text-muted)' }}>
                    Chiosco non connesso
                </p>
                <p className="text-sm mt-1" style={{ color: '#3a3f55' }}>
                    Kiosk offline
                </p>
            </div>

            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · offline
                </div>
            )}
        </div>
    );
}

// ── CollegamentoChiaroScreen ─────────────────────────────────────────────────

interface CollegamentoChiaroScreenProps {
    chiosco:            Chiosco;
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              import('@/hooks/useWebRtcChiosco').StatoParlatoChiosco;
    condivisioneAttiva: boolean;
    grigliaDoc?:        boolean;
    inAttesa?:          boolean;
    messaggioAttesa?:   string;
}

/** Stile della miniatura video (angolo basso-destra). */
const STILE_MINIATURA: React.CSSProperties = {
    bottom: '16px', right: '16px', width: '160px', height: '120px',
    borderRadius: '12px', objectFit: 'cover', zIndex: 20, backgroundColor: '#050710',
    border: '1px solid rgba(255,255,255,0.25)',
};

/** Overlay "un momento e sono subito da lei": il receptionist sta gestendo un altro chiosco. */
function OverlayAttesa({ messaggio }: { messaggio?: string }) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 px-8 text-center"
             style={{ backgroundColor: 'rgba(5,7,16,0.94)' }}>
            <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
                 style={{ borderColor: 'rgba(59,130,246,0.35)', borderTopColor: '#3b82f6' }} />
            <div>
                <p className="text-2xl font-light" style={{ color: '#fff' }}>
                    {messaggio || 'Un momento e sono subito da lei'}
                </p>
                <p className="text-base mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Il receptionist la servirà tra pochi istanti
                </p>
            </div>
        </div>
    );
}

/** Cornice/griglia guida per il posizionamento del documento davanti alla camera. */
function GrigliaDocumento() {
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative" style={{ width: '70%', maxWidth: 520, aspectRatio: '1.586', border: '3px dashed rgba(255,255,255,0.85)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}>
                <span className="absolute -top-7 left-0 right-0 text-center text-sm font-medium" style={{ color: '#fff' }}>
                    Posiziona il documento nel riquadro
                </span>
            </div>
        </div>
    );
}

function CollegamentoChiaroScreen({
    chiosco,
    localVideoRef,
    remoteVideoRef,
    stato,
    condivisioneAttiva,
    grigliaDoc,
    inAttesa,
    messaggioAttesa,
}: CollegamentoChiaroScreenProps) {
    const isConnected = stato === 'connected';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                 style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: isConnected ? '#22c55e' : '#5c6380' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {isConnected ? 'Collegamento in chiaro' : 'Connessione in corso…'}
                    </span>
                    <span className="ml-1 px-1.5 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        CHIARO
                    </span>
                    {condivisioneAttiva && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs animate-pulse"
                              style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                            Schermo condiviso
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome}
                </span>
            </div>

            {/* Area video. In acquisizione documento (grigliaDoc) la camera del
                chiosco diventa grande (con la cornice guida) e il receptionist va
                in miniatura: così l'ospite allinea il documento sul feed giusto. */}
            <div className="flex-1 relative overflow-hidden">
                {/* Receptionist (remoto) */}
                <video ref={remoteVideoRef} autoPlay playsInline className="absolute"
                       style={grigliaDoc ? STILE_MINIATURA : {
                           top: 0, left: 0, width: '100%', height: '100%',
                           display: isConnected ? 'block' : 'none',
                           objectFit: condivisioneAttiva ? 'contain' : 'cover',
                           backgroundColor: condivisioneAttiva ? '#000' : 'transparent',
                       }} />

                {/* Camera chiosco (locale) */}
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute"
                       style={grigliaDoc
                           ? { top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#050710' }
                           : { ...STILE_MINIATURA, border: '1px solid rgba(34,197,94,0.3)' }} />

                {grigliaDoc && <GrigliaDocumento />}
                {inAttesa && <OverlayAttesa messaggio={messaggioAttesa} />}

                {!isConnected && !grigliaDoc && !inAttesa && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <div className="rounded-full flex items-center justify-center"
                             style={{ width: 72, height: 72,
                                      backgroundColor: 'rgba(34,197,94,0.08)',
                                      border: '2px solid rgba(34,197,94,0.3)' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5">
                                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                            </svg>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Collegamento con il receptionist in corso…
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ── ParlatoScreen ─────────────────────────────────────────────────────────────

interface ParlatoScreenProps {
    chiosco:            Chiosco;
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              import('@/hooks/useWebRtcChiosco').StatoParlatoChiosco;
    errore:             ErroreMedia | null;
    condivisioneAttiva: boolean;
    grigliaDoc?:        boolean;
    inAttesa?:          boolean;
    messaggioAttesa?:   string;
}

function ParlatoScreen({
    chiosco,
    localVideoRef,
    remoteVideoRef,
    stato,
    errore,
    condivisioneAttiva,
    grigliaDoc,
    inAttesa,
    messaggioAttesa,
}: ParlatoScreenProps) {
    const isConnected = stato === 'connected';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>

            {/* ── Status bar ── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                 style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: isConnected ? '#3b82f6'
                                                  : stato === 'error' ? '#ef4444'
                                                  : '#5c6380' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {condivisioneAttiva        ? 'Schermo condiviso in corso'
                         : isConnected             ? 'Parlato in corso'
                         : stato === 'connecting'  ? 'Connessione in corso…'
                         : stato === 'error'       ? 'Errore connessione'
                         : 'Negoziazione…'}
                    </span>
                    {condivisioneAttiva && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)' }}>
                            SCHERMO
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome}
                </span>
            </div>

            {/* ── Area video — in acquisizione documento la camera del chiosco
                   diventa grande con la cornice guida; il receptionist va in miniatura ── */}
            <div className="flex-1 relative overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline className="absolute"
                       style={grigliaDoc ? STILE_MINIATURA : {
                           top: 0, left: 0, width: '100%', height: '100%',
                           display: isConnected ? 'block' : 'none',
                           objectFit: condivisioneAttiva ? 'contain' : 'cover',
                           backgroundColor: condivisioneAttiva ? '#000' : 'transparent',
                       }} />

                {!isConnected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
                        <div className="rounded-full flex items-center justify-center shrink-0"
                             style={{ width: 72, height: 72,
                                      backgroundColor: stato === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.08)',
                                      border: `2px solid ${stato === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.3)'}` }}>
                            {stato === 'error' ? (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                                    <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            ) : (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                                </svg>
                            )}
                        </div>
                        {errore ? (
                            <div className="text-center max-w-md space-y-2">
                                <p className="text-base font-medium" style={{ color: '#ef4444' }}>
                                    {errore.messaggio}
                                </p>
                                <p className="text-sm leading-relaxed" style={{ color: '#9ba3c0' }}>
                                    {errore.suggerimento}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                Connessione al receptionist in corso…
                            </p>
                        )}
                    </div>
                )}

                {/* Camera chiosco (locale): miniatura, oppure grande in acquisizione */}
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute"
                       style={grigliaDoc
                           ? { top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#050710' }
                           : { ...STILE_MINIATURA, border: '1px solid rgba(59,130,246,0.3)' }} />

                {grigliaDoc && <GrigliaDocumento />}
                {inAttesa && <OverlayAttesa messaggio={messaggioAttesa} />}
            </div>
        </div>
    );
}
