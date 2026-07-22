import { useEffect, useRef, useState } from 'react';
import { Head } from '@inertiajs/react';
import KioskLayout from '@/Layouts/KioskLayout';
import { Chiosco, StatoChiosco } from '@/types';
import { useLiveKitChiosco } from '@/hooks/useLiveKitChiosco';
import { useKioskHeartbeat } from '@/hooks/useKioskHeartbeat';
import { useKioskStato } from '@/hooks/useKioskStato';
import { useKioskAcquisizione } from '@/hooks/useKioskAcquisizione';
import { useKioskStampa } from '@/hooks/useKioskStampa';
import { useKioskPagamento } from '@/hooks/useKioskPagamento';
import { annullaChiamata, avviaSessioneAi, terminaSessioneAi, annullaAcquisizione } from '@/services/kioskApi';
import PagamentoPOSScreen from '@/Components/Kiosk/PagamentoPOSScreen';
import StampaScreen from '@/Components/Kiosk/StampaScreen';
import AcquisizioneScreen from '@/Components/Kiosk/AcquisizioneScreen';
import AiScreen from '@/Components/Kiosk/AiScreen';
import CompletatoScreen from '@/Components/Kiosk/CompletatoScreen';
import AttesoScreen from '@/Components/Kiosk/AttesoScreen';
import ChiamataInCorsoScreen from '@/Components/Kiosk/ChiamataInCorsoScreen';
import MessaggioAttesaScreen from '@/Components/Kiosk/MessaggioAttesaScreen';
import OfflineScreen from '@/Components/Kiosk/OfflineScreen';
import CollegamentoChiaroScreen from '@/Components/Kiosk/CollegamentoChiaroScreen';
import ParlatoScreen from '@/Components/Kiosk/ParlatoScreen';
import PresenzaBadge from '@/Components/Kiosk/PresenzaBadge';
import { usePresenzaReceptionist } from '@/hooks/usePresenzaReceptionist';

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

    // ── Presenza receptionist: miniatura webcam sempre attiva ───────────────
    const presenza = usePresenzaReceptionist();

    // Routing — usa il sessionTipo riportato dall'hook LiveKit
    const inAi      = stato === 'in_parlato' && lk.sessionTipo === 'parlato' && lk.gestitaDa === 'ai';
    const inParlato = stato === 'in_parlato' && lk.sessionTipo === 'parlato' && ! inAi;
    const inChiaro  = stato === 'in_chiaro'  && lk.sessionTipo === 'chiaro';

    // La miniatura resta visibile in benvenuto e per tutto il self check-in;
    // sparisce solo quando il receptionist è già a schermo (chiaro/parlato).
    const mostraPresenza = presenza.online && ! inChiaro && ! inParlato;

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

            {/* Miniatura presenza receptionist — sempre visibile tranne nei
                collegamenti pieni, dove il receptionist è già a schermo */}
            {mostraPresenza && presenza.track && <PresenzaBadge track={presenza.track} />}

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
                    trackCondiviso={lk.localCameraTrack}
                />
            ) : inAi ? (
                <AiScreen
                    scopo={aiScopo}
                    statoMedia={lk.stato}
                    localVideoRef={lk.localVideoRef}
                    aiUi={lk.aiUi}
                    audioTrack={lk.remoteAudioTrack}
                    audioBloccato={lk.audioBloccato}
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
