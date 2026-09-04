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
 * Lo stesso account chiosco è stato aperto su un altro dispositivo/tab: LiveKit
 * ammette UNA connessione per identità e l'ultima arrivata vince. Invece di
 * riconnettersi a ripetizione (e far saltare la schermata ogni 2 secondi su
 * entrambi), questo dispositivo si ferma e lascia scegliere.
 */
function DuplicatoScreen({ chiosco }: { chiosco: Chiosco }) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center text-center px-8">
            <div className="rounded-full flex items-center justify-center mb-6"
                 style={{ width: 84, height: 84, backgroundColor: 'rgba(245,158,11,0.10)', border: '2px solid rgba(245,158,11,0.5)' }}>
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="1.6">
                    <rect x="2" y="4" width="13" height="10" rx="2" /><rect x="9" y="10" width="13" height="10" rx="2" />
                </svg>
            </div>
            <h1 className="kiosk-title font-light mb-2" style={{ color: 'var(--color-text-primary)' }}>
                «{chiosco.nome}» è aperto su un altro dispositivo
            </h1>
            <p className="max-w-xl" style={{ fontSize: 16, color: 'var(--color-text-muted)', lineHeight: 1.55 }}>
                Ogni chiosco può essere attivo su un solo schermo alla volta. Chiudi l'altra finestra
                (questo schermo riprova da solo tra 30 secondi), oppure prendi il controllo da qui.
            </p>
            <button onClick={() => window.location.reload()}
                    className="mt-8 rounded-xl px-8 py-4 font-semibold active:scale-95 transition-transform"
                    style={{ fontSize: 17, backgroundColor: 'var(--color-parlato)', color: '#fff', minHeight: 56 }}>
                Usa questo dispositivo
            </button>
        </div>
    );
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
    // Il riepilogo post-AI (CompletatoScreen) è dichiarato più sotto; qui un
    // ref per sapere se è a schermo senza riordinare gli hook.
    const fineSessioneAttiva = useRef(false);

    // Routing delle schermate media: la fonte di verità è la SESSIONE scoperta
    // dal poll del token LiveKit (ogni 2 s), non lo stato Portineria via Reverb.
    // Prima serviva anche `stato === 'in_parlato'`: un evento Reverb perso
    // lasciava il chiosco sulla schermata di attesa con l'AI che parlava, e un
    // secondo tocco sul bottone faceva ripartire la sessione da capo.
    const inAi      = lk.sessionTipo === 'parlato' && lk.gestitaDa === 'ai';
    const inParlato = lk.sessionTipo === 'parlato' && lk.gestitaDa === 'umano';
    const inChiaro  = lk.sessionTipo === 'chiaro';

    // ── Presenza receptionist: canale sempre acceso ─────────────────────────
    // La camera del chiosco va in stanza presenza (griglia live in Portineria)
    // solo quando NON è già impegnata in una sessione media (chiaro/parlato/AI).
    // 'connecting' incluso: la presenza rilascia la webcam PRIMA che la sessione la chieda
    const sessioneMediaAttiva = inAi || inParlato || inChiaro || lk.stato === 'connected' || lk.stato === 'connecting'
        || (lk.sessionTipo !== null && lk.stato !== 'error');
    const presenza = usePresenzaReceptionist(! sessioneMediaAttiva);

    // In attesa il receptionist è grande al centro (AttesoScreen); la miniatura
    // serve nelle altre schermate (AI, acquisizione, POS…) tranne nei
    // collegamenti pieni, dove il receptionist è già a schermo.
    const schermataAttesa = ! pagamento && ! stampa && ! acquisizione && ! inAi && ! inParlato && ! inChiaro
        && ! ['in_chiamata', 'messaggio_attesa', 'offline'].includes(stato) && ! fineSessioneAttiva.current;
    const mostraPresenzaBadge = presenza.online && ! inChiaro && ! inParlato && ! schermataAttesa;

    // ── Heartbeat con diagnostica media: il server (e la pagina Diagnostica)
    //    sanno cosa vede il browser del chiosco, anche da remoto ─────────────
    useKioskHeartbeat(60_000, {
        sessione:           lk.stato,
        sessione_tipo:      lk.sessionTipo,
        gestita_da:         lk.gestitaDa,
        errore:             lk.ultimoErrore,
        duplicato:          lk.duplicato,
        presenza_online:    presenza.online,
        presenza_connessa:  presenza.connessa,
        presenza_duplicato: presenza.duplicato,
        presenza_errore:    presenza.errore,
        audio_bloccato:     lk.audioBloccato || (presenza.parla && presenza.audioBloccato),
    });

    // ── Handler annullo chiamata (stato in_chiamata raggiungibile da demo) ──
    const handleAnnullaChiamata = async () => {
        await annullaChiamata();
    };

    // ── Lingua della conversazione con l'AI (bandierine sulla schermata di attesa)
    const linguaDefault = chiosco.hotel?.lingua_default ?? 'it';
    const lingue = (chiosco.hotel?.lingue_abilitate?.length ? chiosco.hotel.lingue_abilitate : [linguaDefault]);
    const [lingua, setLingua] = useState<string>(lingue.includes(linguaDefault) ? linguaDefault : lingue[0]);

    // ── Handler self check-in / check-out AI ────────────────────────────────
    type ScopoAi = 'checkin' | 'checkout' | 'info';
    const [aiLoading, setAiLoading] = useState<ScopoAi | null>(null);
    const [aiScopo,   setAiScopo]   = useState<ScopoAi>('checkin');
    const [aiErrore,  setAiErrore]  = useState<string | null>(null);

    const handleAvviaAi = async (scopo: ScopoAi) => {
        // Il backend è l'arbitro (KioskAiController); qui si evita solo di
        // interrompere un collegamento condotto da un receptionist umano o
        // una chiamata in corso. Da in_nascosto (l'ospite non sa del
        // monitoraggio) e da offline il tocco deve funzionare.
        const collegamentoUmano = inChiaro || inParlato;
        if (aiLoading || collegamentoUmano || ['in_chiamata', 'messaggio_attesa'].includes(stato)) return;
        setAiLoading(scopo);
        setAiErrore(null);
        const res = await avviaSessioneAi(scopo, lingua);
        if (! res.ok) setAiErrore(res.error ?? "L'assistente non è disponibile.");
        else setAiScopo(scopo);
        setAiLoading(null);
        // Aggancio immediato alla nuova sessione (senza aspettare il prossimo
        // poll da 2 s): meno silenzio tra il tocco e la voce dell'assistente.
        if (res.ok) lk.aggiorna();
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
    fineSessioneAttiva.current = fineSessione !== null;
    useEffect(() => {
        if (inAi) {
            ultimoAiRef.current = { ui: lk.aiUi, scopo: aiScopo };
            eraInAi.current = true;
            return;
        }
        if (eraInAi.current) {
            eraInAi.current = false;
            setLingua(lingue.includes(linguaDefault) ? linguaDefault : lingue[0]); // il prossimo ospite riparte dal default
            const u = ultimoAiRef.current;
            const utile = u && (u.ui.codice || u.ui.pagamento?.stato === 'ok');
            if (utile) {
                setFineSessione(u);
                const t = setTimeout(() => setFineSessione(null), 45_000);
                return () => clearTimeout(t);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [inAi, lk.aiUi, aiScopo]);

    // ── Rendering condizionale per stato ───────────────────────────────────
    return (
        <KioskLayout>
            <Head title="Chiosco" />

            {/* Miniatura presenza receptionist — nelle schermate in cui non è
                già grande (attesa) né a schermo pieno (chiaro/parlato) */}
            {mostraPresenzaBadge && presenza.track && <PresenzaBadge track={presenza.track} />}

            {/* Solo presenza duplicata: avviso discreto, il chiosco resta operativo */}
            {presenza.duplicato && ! lk.duplicato && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 rounded-full px-4 py-1.5 text-xs"
                     style={{ backgroundColor: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.45)', color: '#fcd34d' }}>
                    Questo chiosco risulta aperto anche su un altro dispositivo — chiudi l'altra finestra
                </div>
            )}

            {/* Chiosco aperto su un altro dispositivo: qui ci fermiamo (niente scalci reciproci) */}
            {lk.duplicato ? (
                <DuplicatoScreen chiosco={chiosco} />
            ) : pagamento && ! inParlato && ! inChiaro ? (
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
                    presenza={presenza}
                    onAvviaAi={handleAvviaAi}
                    aiLoading={aiLoading}
                    aiErrore={aiErrore}
                    lingue={lingue}
                    lingua={lingua}
                    onLingua={setLingua}
                />
            )}
        </KioskLayout>
    );
}
