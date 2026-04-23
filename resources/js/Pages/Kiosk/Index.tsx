import { useCallback, useEffect, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import KioskLayout from '@/Layouts/KioskLayout';
import { Chiosco, StatoChiosco } from '@/types';
import { useWebRtcChiosco } from '@/hooks/useWebRtcChiosco';
import { useKioskHeartbeat } from '@/hooks/useKioskHeartbeat';
import { useKioskStato } from '@/hooks/useKioskStato';
import { useKioskAcquisizione } from '@/hooks/useKioskAcquisizione';
import { useKioskStampa } from '@/hooks/useKioskStampa';
import { chiamaReceptionist, annullaChiamata, uploadDocumentoAcquisito, annullaAcquisizione, getDocumentoPerStampa, segnalaStampaCompletata, annullaStampa, segnalaEsitoPagamento, annullaPagamento } from '@/services/kioskApi';
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
    const [chiamataLoading, setChiamataLoading] = useState(false);

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

    // ── WebRTC (gestisce le sessioni chiaro/nascosto/parlato) ───────────────
    const webrtc = useWebRtcChiosco({ chioscoId: chiosco.id });

    // Routing WebRTC — usa sessionTipo per sapere quale media hook è attivo
    const inParlato = stato === 'in_parlato' && webrtc.sessionTipo === 'parlato';
    const inChiaro  = stato === 'in_chiaro'  && webrtc.sessionTipo === 'chiaro';

    // ── Handler chiamata (touch) ────────────────────────────────────────────
    const handleChiama = async () => {
        if (chiamataLoading || stato !== 'idle') return;
        setChiamataLoading(true);
        await chiamaReceptionist();
        setChiamataLoading(false);
        // Lo stato si aggiorna via Reverb / polling in useKioskStato
    };

    const handleAnnullaChiamata = async () => {
        await annullaChiamata();
    };

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
                    onCompletata={annullaAcquisizione}
                    onAnnulla={annullaAcquisizione}
                />
            ) : inParlato ? (
                <ParlatoScreen
                    chiosco={chiosco}
                    localVideoRef={webrtc.localVideoRef}
                    remoteVideoRef={webrtc.remoteVideoRef}
                    stato={webrtc.stato}
                    errore={webrtc.errore}
                    condivisioneAttiva={webrtc.condivisioneAttiva}
                />
            ) : inChiaro ? (
                /* Chiaro: video bidirezionale, no audio */
                <CollegamentoChiaroScreen
                    chiosco={chiosco}
                    localVideoRef={webrtc.localVideoRef}
                    remoteVideoRef={webrtc.remoteVideoRef}
                    stato={webrtc.stato}
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
            ) : (
                /* idle / in_nascosto (guest non sa) / stati sconosciuti → schermata attesa */
                <AttesoScreen
                    chiosco={chiosco}
                    onChiama={handleChiama}
                    loading={chiamataLoading}
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
                style={{ backgroundColor: '#080a12', borderBottom: '1px solid #1a1d27' }}>
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
                                    color:           '#5c6380',
                                    border:          '1px solid #2e3348',
                                    backgroundColor: '#0d1020',
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
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(92,99,128,0.08)', border: '2px solid #2e3348' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xl font-light" style={{ color: '#5c6380' }}>
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
                style={{ backgroundColor: '#080a12', borderBottom: '1px solid #1a1d27' }}>
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
                                style={{ color: '#5c6380', border: '1px solid #2e3348', backgroundColor: '#0d1020' }}>
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
    onCompletata:  () => void;
    onAnnulla:     () => void;
}

type FaseAcquisizione = 'preview' | 'uploading' | 'completata' | 'errore';

function AcquisizioneScreen({ chiosco, titolo, onCompletata, onAnnulla }: AcquisizioneScreenProps) {
    const videoRef   = useRef<HTMLVideoElement>(null);
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const streamRef  = useRef<MediaStream | null>(null);
    const mountedRef = useRef(true);

    const [fase,    setFase]    = useState<FaseAcquisizione>('preview');
    const [errore,  setErrore]  = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<string | null>(null); // data-URL anteprima

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
            const result = await uploadDocumentoAcquisito(blob);
            if (! mountedRef.current) return;
            if (result.ok) {
                setFase('completata');
                // Stop webcam
                streamRef.current?.getTracks().forEach(t => t.stop());
                setTimeout(() => { if (mountedRef.current) onCompletata(); }, 2_000);
            } else {
                setFase('errore');
                setErrore(result.errore ?? 'Errore upload');
            }
        }, 'image/jpeg', 0.92);
    }, [onCompletata]);

    const handleRiprendi = () => {
        setSnapshot(null);
        setFase('preview');
        setErrore(null);
    };

    const handleAnnullaGuest = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        await onAnnulla();
    };

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: '#080a12', borderBottom: '1px solid #1a1d27' }}>
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
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">

                {/* Preview / snapshot */}
                {(fase === 'preview' || fase === 'uploading') && (
                    <div className="relative rounded-2xl overflow-hidden shadow-2xl"
                        style={{ width: '480px', maxWidth: '90vw', aspectRatio: '4/3',
                                 backgroundColor: '#0a0c12', border: '2px solid rgba(59,130,246,0.3)' }}>
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
                        <p className="text-xl font-light" style={{ color: '#22c55e' }}>Documento acquisito</p>
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
                            Inquadrare il documento e premere <strong>Cattura</strong>
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Frame your document and tap <strong>Capture</strong>
                        </p>
                    </div>
                )}
                {fase === 'preview' && snapshot && (
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Verificare l'immagine. Se corretta, premere <strong>Invia</strong>.
                    </p>
                )}

                {/* Pulsanti azione */}
                <div className="flex items-center gap-4">
                    {fase === 'preview' && ! snapshot && (
                        <>
                            <button onClick={handleAnnullaGuest}
                                className="rounded-xl px-6 py-3 text-sm"
                                style={{ color: '#5c6380', border: '1px solid #2e3348', backgroundColor: '#0d1020' }}>
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
                                style={{ color: '#5c6380', border: '1px solid #2e3348', backgroundColor: '#0d1020' }}>
                                Riprendi
                            </button>
                            <button onClick={handleInvia}
                                className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                                style={{ backgroundColor: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                Invia documento
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

// ── AttesoScreen ─────────────────────────────────────────────────────────────
// Mostrata in idle e in_nascosto (monitoraggio silenzioso: il guest non sa nulla).

interface AttesoScreenProps {
    chiosco:  Chiosco;
    onChiama: () => void;
    loading:  boolean;
}

function AttesoScreen({ chiosco, onChiama, loading }: AttesoScreenProps) {
    return (
        <>
            {/* Indicatore connessione — top left */}
            <div className="absolute top-3 left-3 flex items-center gap-1.5 text-xs z-10">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-ok)' }} />
                <span style={{ color: 'var(--color-text-muted)' }}>Connesso</span>
            </div>

            {/* Area principale */}
            <div className="w-full h-full flex flex-col items-center justify-center">
                {/* Placeholder video receptionist */}
                <div className="rounded-2xl flex items-center justify-center mb-8"
                     style={{
                         width: '480px', height: '360px',
                         maxWidth: '80vw', maxHeight: '60vh',
                         backgroundColor: '#060810',
                         border: '1px solid #1a1d27',
                     }}>
                    <div className="text-center" style={{ color: '#2e3348' }}>
                        <div className="mb-3">
                            <svg width="56" height="56" viewBox="0 0 24 24" fill="none"
                                 stroke="#2e3348" strokeWidth="1" className="mx-auto">
                                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                            </svg>
                        </div>
                        <p className="text-sm">In attesa del receptionist</p>
                    </div>
                </div>

                {/* Touch kiosk — tasto/area touch per chiamare */}
                {chiosco.tipo === 'touch' && (
                    <div className="text-center px-8">
                        <button
                            onClick={onChiama}
                            disabled={loading}
                            className="rounded-2xl transition-all active:scale-95"
                            style={{
                                padding:         '20px 48px',
                                backgroundColor: loading ? 'rgba(34,197,94,0.05)' : 'rgba(34,197,94,0.08)',
                                border:          `2px solid ${loading ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.4)'}`,
                                cursor:          loading ? 'default' : 'pointer',
                            }}
                        >
                            <div className="flex flex-col items-center gap-3">
                                <svg width="36" height="36" viewBox="0 0 24 24" fill="none"
                                     stroke="#22c55e" strokeWidth="1.5"
                                     style={{ opacity: loading ? 0.4 : 1 }}>
                                    <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                                </svg>
                                <span className="text-lg font-light" style={{ color: '#22c55e' }}>
                                    {loading ? 'Chiamata in corso…' : 'Chiama il receptionist'}
                                </span>
                                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                    Call reception
                                </span>
                            </div>
                        </button>
                    </div>
                )}

                {/* Analogico — istruzione per campanello fisico */}
                {chiosco.tipo === 'analogico' && (
                    <div className="text-center px-8">
                        <div className="mb-4">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none"
                                 stroke="rgba(34,197,94,0.5)" strokeWidth="1" className="mx-auto">
                                <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" />
                            </svg>
                        </div>
                        <p className="text-lg font-light" style={{ color: 'var(--color-text-secondary)' }}>
                            Suonare il campanello per chiamare il receptionist
                        </p>
                        <p className="text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            Ring the bell to call reception
                        </p>

                        {/* Simulazione campanello — solo in DEV (analogico non ha hardware reale in test) */}
                        {import.meta.env.DEV && (
                            <button
                                onClick={onChiama}
                                disabled={loading}
                                className="mt-6 rounded-lg px-4 py-2 text-xs font-mono transition-all"
                                style={{
                                    color:           '#5c6380',
                                    border:          '1px solid #2e3348',
                                    backgroundColor: '#0d1020',
                                    cursor:          loading ? 'not-allowed' : 'pointer',
                                }}
                            >
                                [DEV] Simula campanello
                            </button>
                        )}
                    </div>
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
                     border:          '2px solid #2e3348',
                 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                    <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
            </div>
            <div className="text-center">
                <p className="text-lg font-light" style={{ color: '#5c6380' }}>
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
    chiosco:        Chiosco;
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:          import('@/hooks/useWebRtcChiosco').StatoParlatoChiosco;
}

function CollegamentoChiaroScreen({
    chiosco,
    localVideoRef,
    remoteVideoRef,
    stato,
}: CollegamentoChiaroScreenProps) {
    const isConnected = stato === 'connected';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                 style={{ backgroundColor: '#080a12', borderBottom: '1px solid #1a1d27' }}>
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
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome}
                </span>
            </div>

            {/* Video receptionist (remoto) — principale */}
            <div className="flex-1 relative overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline
                       className="w-full h-full object-cover"
                       style={{ display: isConnected ? 'block' : 'none' }} />
                {!isConnected && (
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

                {/* Miniatura video chiosco (locale) */}
                <div className="absolute bottom-4 right-4 rounded-xl overflow-hidden shadow-xl"
                     style={{ width: '160px', height: '120px',
                              backgroundColor: '#0a0c12',
                              border: '1px solid rgba(34,197,94,0.3)' }}>
                    <video ref={localVideoRef} autoPlay playsInline muted
                           className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-0 right-0 text-center"
                         style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {chiosco.nome}
                    </div>
                </div>
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
}

function ParlatoScreen({
    chiosco,
    localVideoRef,
    remoteVideoRef,
    stato,
    errore,
    condivisioneAttiva,
}: ParlatoScreenProps) {
    const isConnected = stato === 'connected';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>

            {/* ── Status bar ── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                 style={{ backgroundColor: '#080a12', borderBottom: '1px solid #1a1d27' }}>
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

            {/* ── Video principale — receptionist (remoto) ── */}
            <div className="flex-1 relative overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline
                       className="w-full h-full object-cover"
                       style={{ display: isConnected ? 'block' : 'none' }} />

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

                {/* Video locale (chiosco) — miniatura in basso a destra */}
                <div className="absolute bottom-4 right-4 rounded-xl overflow-hidden shadow-xl"
                     style={{ width: '160px', height: '120px',
                              backgroundColor: '#0a0c12',
                              border: '1px solid rgba(59,130,246,0.3)' }}>
                    <video ref={localVideoRef} autoPlay playsInline muted
                           className="w-full h-full object-cover" />
                    <div className="absolute bottom-1.5 left-0 right-0 text-center"
                         style={{ fontSize: '9px', color: 'rgba(255,255,255,0.4)' }}>
                        {chiosco.nome}
                    </div>
                </div>
            </div>
        </div>
    );
}
