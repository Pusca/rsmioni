import { useEffect, useRef, useState } from 'react';
import { ChioscoConStato, StatoChiosco, Profilo } from '@/types';
import BadgeStato from './BadgeStato';
import {
    cambiaStato,
    creaSessioneParlato,
    chiudiSessioneParlato,
    creaSessioneCollegamento,
    chiudiSessioneCollegamento,
    subentraSessioneAi,
} from '@/services/portineriaApi';
import type { ErroreMedia, StatoCollegamento, TipoCollegamento } from '@/types/media';
import { useLiveKitCall } from '@/hooks/useLiveKitCall';
import * as liveKitCall from '@/services/liveKitCall';
import * as presenza from '@/services/presenzaReceptionist';
import CatturaDocumento from './CatturaDocumento';
import CollegamentoView from './CollegamentoView';
import ParlatoView from './ParlatoView';
import AzioneBtn from './AzioneBtn';
import { EyeOffIcon, MsgIcon, MicIcon, XIcon, ScreenIcon, DocIcon, ScreenStopIcon } from '@/Components/Icons';

interface Props {
    chiosco: ChioscoConStato | null;
    profilo: Profilo;
    onStatoChanged: (chioscoId: string, stato: StatoChiosco, messaggio?: string | null) => void;
    onApriMessaggio: () => void;
}

export default function AreaVideo({ chiosco, profilo, onStatoChanged, onApriMessaggio }: Props) {
    const [loading,         setLoading]         = useState(false);
    const [errore,          setErrore]          = useState<string | null>(null);
    // Sessione parlato (audio+video)
    const [sessionId,       setSessionId]       = useState<string | null>(null);
    // Sessione chiaro/nascosto (video only)
    const [mediaSessionId,  setMediaSessionId]  = useState<string | null>(null);
    const [mediaSessionTipo, setMediaSessionTipo] = useState<TipoCollegamento | null>(null);

    const isRL = profilo === 'receptionist_lite';
    const [showCattura, setShowCattura] = useState(false);

    // Snapshot multi-room dal gestore singleton (persiste tra le pagine).
    // `call` = stato della chiamata DEL CHIOSCO SELEZIONATO (può non esserci).
    const snap = useLiveKitCall();
    const call = chiosco ? snap.calls[chiosco.id] : undefined;
    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);

    // ── Presenza: video live del chiosco + microfono (canale sempre acceso) ─
    const snapPresenza  = presenza.usePresenza();
    const presenzaTrack = chiosco ? snapPresenza.tracks[chiosco.id] ?? null : null;
    const micAttivo     = !!chiosco && snapPresenza.parlaCon === chiosco.id;
    const [micLoading, setMicLoading] = useState(false);

    // ── Ascolto nascosto: sento il chiosco senza che l'ospite se ne accorga ─
    // Con una sessione AI in corso l'audio arriva dalla stanza della chiamata
    // (voce ospite + assistente); altrimenti dal canale presenza (microfono
    // del chiosco acceso su richiesta, senza pubblicare la mia voce).
    const ascoltoAi       = !!call && call.gestitaDa === 'ai';
    const ascoltoAttivo   = !!chiosco && (ascoltoAi ? call!.ascolto : snapPresenza.ascoltaCon === chiosco.id);
    const [ascoltoErrore, setAscoltoErrore] = useState<string | null>(null);
    const toggleAscolto = () => {
        if (!chiosco) return;
        setAscoltoErrore(null);
        if (ascoltoAi) {
            liveKitCall.setAscolto(chiosco.id, !call!.ascolto);
            return;
        }
        const ok = presenza.ascolta(ascoltoAttivo ? null : chiosco.id);
        if (!ascoltoAttivo && !ok) {
            setAscoltoErrore('Il chiosco non è collegato alla presenza (schermata chiosco chiusa o offline).');
        }
    };
    // Se parte una sessione AI mentre ascolto dalla presenza, l'ascolto passa
    // alla stanza della chiamata senza che il receptionist debba rifare nulla.
    useEffect(() => {
        if (!chiosco || !ascoltoAi) return;
        if (snapPresenza.ascoltaCon === chiosco.id) {
            presenza.ascolta(null);
            liveKitCall.setAscolto(chiosco.id, true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chiosco?.id, ascoltoAi]);
    const presenzaVideoRef = useRef<HTMLVideoElement | null>(null);
    useEffect(() => {
        const el = presenzaVideoRef.current;
        if (!el) return;
        el.srcObject = presenzaTrack ? new MediaStream([presenzaTrack]) : null;
        if (presenzaTrack) el.play().catch(() => {});
    }, [presenzaTrack, chiosco?.id, chiosco?.stato]);

    // Resetta solo lo stato LOCALE quando cambia il chiosco selezionato
    // (NON tocca la chiamata nel singleton: quella persiste).
    const prevChioscoId = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (prevChioscoId.current !== chiosco?.id) {
            prevChioscoId.current = chiosco?.id;
            setSessionId(null);
            setMediaSessionId(null);
            setMediaSessionTipo(null);
            setErrore(null);
        }
    }, [chiosco?.id]);

    // ── Avvio chiamata in base allo stato + sessione creata ────────────────
    // chiaro/nascosto
    useEffect(() => {
        if (chiosco && (chiosco.stato === 'in_chiaro' || chiosco.stato === 'in_nascosto')
            && mediaSessionId && mediaSessionTipo) {
            liveKitCall.startCall({
                sessionId: mediaSessionId, tipo: mediaSessionTipo,
                chioscoId: chiosco.id, chioscoNome: chiosco.nome, hotelId: chiosco.hotel_id,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chiosco?.id, chiosco?.stato, mediaSessionId, mediaSessionTipo]);

    // parlato
    useEffect(() => {
        if (chiosco && chiosco.stato === 'in_parlato' && sessionId) {
            liveKitCall.startCall({
                sessionId, tipo: 'parlato',
                chioscoId: chiosco.id, chioscoNome: chiosco.nome, hotelId: chiosco.hotel_id,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chiosco?.id, chiosco?.stato, sessionId]);

    // Passaggio fluido: selezionare un chiosco con chiamata connessa la rende
    // subito attiva (la precedente va in attesa da sola, resta UNA sola attiva).
    // Le room 'nascosto' NON si attivano da sole: guardare un monitoraggio non
    // deve interrompere la chiamata in corso (per quelle resta "Riprendi").
    useEffect(() => {
        if (chiosco && call && !call.attiva && call.stato === 'connected' && call.tipo !== 'nascosto') {
            liveKitCall.setActive(chiosco.id);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chiosco?.id, call?.stato]);

    // Attacca i <video> alle track del CHIOSCO SELEZIONATO quando cambia lo stato.
    useEffect(() => {
        liveKitCall.attachRemote(remoteVideoRef.current, chiosco?.id);
        liveKitCall.attachLocal(localVideoRef.current, chiosco?.id);
        // chiosco?.stato/id: al rientro in Portineria (dal PiP) la vista si rimonta
        // → riaggancia il video, altrimenti resta nero.
    }, [call?.stato, call?.condivisione, snap.condivisioneLocale, call?.remoteVer, chiosco?.stato, chiosco?.id]);

    // Viste: adattano lo stato del gestore all'interfaccia delle sub-view
    const statoCollegamento: StatoCollegamento = call?.stato ?? 'connecting';
    const erroreMedia: ErroreMedia | null = call?.stato === 'error'
        ? { tipo: 'sconosciuto', messaggio: 'Connessione non riuscita.', suggerimento: 'Chiudi e riprova il collegamento.' }
        : null;

    // ── Helper: avvia sessione media per lo stato target ──────────────────
    const avviaSessioneMedia = async (tipo: TipoCollegamento) => {
        if (!chiosco) return;
        const res = await creaSessioneCollegamento(chiosco.id, tipo);
        if (res.ok) {
            setMediaSessionId(res.data.session_id);
            setMediaSessionTipo(tipo);
        }
        // Se fallisce: nessun video, ma lo stato rimane corretto
    };

    // ── Transizioni di stato standard ──────────────────────────────────────
    const transizione = async (nuovoStato: StatoChiosco) => {
        if (!chiosco || loading) return;
        setLoading(true);
        setErrore(null);

        // Chiudi sessione media attiva prima della transizione.
        // sid dal gestore: il mediaSessionId locale è azzerato al cambio chiosco.
        const sidMedia = mediaSessionId ?? (call && call.tipo !== 'parlato' ? call.sessionId : null);
        if (sidMedia) {
            await chiudiSessioneCollegamento(sidMedia, chiosco.id);
            setMediaSessionId(null);
            setMediaSessionTipo(null);
        }

        const res = await cambiaStato(chiosco.id, nuovoStato);
        setLoading(false);

        if (res.ok) {
            onStatoChanged(chiosco.id, nuovoStato);
            // Avvia sessione media per stati che richiedono video
            if (nuovoStato === 'in_chiaro' || nuovoStato === 'in_nascosto') {
                const tipo: TipoCollegamento = nuovoStato === 'in_chiaro' ? 'chiaro' : 'nascosto';
                await avviaSessioneMedia(tipo);
            } else {
                // Stato senza media (es. idle): chiudi la chiamata di QUESTO chiosco
                liveKitCall.stopCall(chiosco.id);
            }
        } else {
            setErrore(res.error ?? 'Errore');
        }
    };

    // ── Parla col chiosco: voce e video subito ────────────────────────────
    // Parte da idle, chiamata in arrivo, nascosto o messaggio di attesa: il
    // backend porta il chiosco in parlato e chiude l'eventuale sessione media
    // precedente (nascosto/chiaro). Il "chiaro" non è più un passaggio.
    const avviaParlato = async () => {
        if (!chiosco || loading) return;

        setLoading(true);
        setErrore(null);
        const res = await creaSessioneParlato(chiosco.id);
        setLoading(false);
        if (res.ok) {
            setMediaSessionId(null);
            setMediaSessionTipo(null);
            setSessionId(res.data.session_id);
            onStatoChanged(chiosco.id, 'in_parlato');
        } else {
            setErrore(res.error);
        }
    };

    // ── Subentra sull'AI: la sessione diventa umana, l'agent esce ──────────
    // La stanza resta la stessa: qui si promuove la call locale da osservatore
    // nascosto a parlato attivo (pubblica camera+mic). Da questo momento
    // valgono le regole umane, incluso il messaggio di attesa.
    const subentraAi = async () => {
        if (!chiosco || !call || loading) return;
        setLoading(true);
        setErrore(null);
        const res = await subentraSessioneAi(chiosco.id);
        if (res.ok) {
            const sid = res.sessionId;
            liveKitCall.stopCall(chiosco.id);
            await liveKitCall.startCall({
                sessionId: sid, tipo: 'parlato',
                chioscoId: chiosco.id, chioscoNome: chiosco.nome, hotelId: chiosco.hotel_id,
            });
            setSessionId(sid);
        } else {
            setErrore(res.error);
        }
        setLoading(false);
    };

    // ── Microfono verso il chiosco selezionato (workflow docs/11) ─────────
    // Un solo chiosco alla volta; su una sessione AI equivale a Subentra.
    const toggleMic = async () => {
        if (!chiosco || micLoading) return;
        if (call?.gestitaDa === 'ai' && !micAttivo) { await subentraAi(); return; }
        setMicLoading(true);
        setErrore(null);
        const ok = await presenza.parlaCon(micAttivo ? null : chiosco.id);
        if (!micAttivo && !ok) {
            setErrore(presenza.raggiungibile(chiosco.id)
                ? 'Microfono non disponibile: controlla i permessi del browser.'
                : 'Il chiosco non è collegato alla presenza (schermata chiosco chiusa o offline).');
        }
        setMicLoading(false);
    };

    // ── Termina sessione AI (supervisione umana: il receptionist può sempre) ─
    const terminaAi = async () => {
        if (!chiosco || !call || loading) return;
        setLoading(true);
        await chiudiSessioneParlato(call.sessionId, chiosco.id); // elimina la sessione → chiosco e agent si scollegano
        liveKitCall.stopCall(chiosco.id);
        await cambiaStato(chiosco.id, 'idle');
        onStatoChanged(chiosco.id, 'idle');
        setLoading(false);
    };

    // ── Chiudi parlato: chiusura completa, il chiosco torna disponibile ───
    // Il session id viene dal gestore (call.sessionId), perché il sessionId
    // locale è azzerato quando si cambia chiosco. Il video del chiosco resta
    // comunque visibile dalla presenza (canale sempre acceso).
    const chiudiParlato = async () => {
        if (!chiosco || loading) return;
        const sid = call?.sessionId ?? sessionId;

        if (snap.condivisioneLocale) liveKitCall.stopScreenShare();
        setLoading(true);
        setErrore(null);

        if (sid) await chiudiSessioneParlato(sid, chiosco.id);
        setSessionId(null);
        liveKitCall.stopCall(chiosco.id);
        await cambiaStato(chiosco.id, 'idle');
        onStatoChanged(chiosco.id, 'idle');
        setMediaSessionId(null);
        setMediaSessionTipo(null);
        setLoading(false);
    };

    return (
        <div
            className="flex flex-col h-full"
            style={{ backgroundColor: 'var(--color-bg-primary)' }}
        >
            {/* ── Nessuna selezione ── */}
            {!chiosco && <NessunaSeleziona />}

            {/* ── Chiosco selezionato ── */}
            {chiosco && (
                <>
                    {/* Header area video */}
                    <div
                        className="flex items-center justify-between px-4 py-2.5 shrink-0 border-b"
                        style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-primary)' }}
                    >
                        <div className="flex items-center gap-3">
                            <BadgeStato stato={chiosco.stato} size="md" />
                            <span className="font-semibold" style={{ fontSize: '14px', color: 'var(--color-text-primary)' }}>
                                {chiosco.nome}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                {chiosco.hotel?.nome}
                            </span>
                            {call?.attiva && (
                                <span className="flex items-center gap-1.5 rounded px-2 py-0.5"
                                      style={{ backgroundColor: '#3b82f6', color: '#fff', fontSize: '10px', fontWeight: 700 }}>
                                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#fff' }} />
                                    IN GESTIONE
                                </span>
                            )}
                            {call?.gestitaDa === 'ai' && (
                                <span className="flex items-center gap-1.5 rounded px-2 py-0.5"
                                      style={{ backgroundColor: '#8b5cf6', color: '#fff', fontSize: '10px', fontWeight: 700 }}>
                                    <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#fff' }} />
                                    RECEPTIONIST AI
                                </span>
                            )}
                        </div>

                        <div className="flex items-center gap-3">
                            {/* Ascolto nascosto: sento il chiosco (o la conversazione con l'AI) senza intervenire */}
                            {chiosco.stato !== 'offline' && !(call?.gestitaDa === 'umano' && call?.tipo === 'parlato') && (
                                <button
                                    onClick={toggleAscolto}
                                    title={ascoltoAttivo ? 'Smetti di ascoltare' : ascoltoAi ? 'Ascolta la conversazione con l\'assistente (l\'ospite non se ne accorge)' : 'Ascolta il chiosco in nascosto (l\'ospite non se ne accorge)'}
                                    className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95"
                                    style={{
                                        backgroundColor: ascoltoAttivo ? '#eab308' : 'rgba(234,179,8,0.10)',
                                        color:           ascoltoAttivo ? '#1a1d2b' : '#fde68a',
                                        border:          `1px solid ${ascoltoAttivo ? '#eab308' : 'rgba(234,179,8,0.45)'}`,
                                        boxShadow:       ascoltoAttivo ? '0 0 0 4px rgba(234,179,8,0.18)' : 'none',
                                    }}
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                        <path d="M3 18v-6a9 9 0 0118 0v6" />
                                        <path d="M21 19a2 2 0 01-2 2h-1a2 2 0 01-2-2v-3a2 2 0 012-2h3zM3 19a2 2 0 002 2h1a2 2 0 002-2v-3a2 2 0 00-2-2H3z" />
                                    </svg>
                                    {ascoltoAttivo ? 'In ascolto' : 'Ascolta'}
                                </button>
                            )}
                            {/* Microfono: il modo veloce di parlare con QUESTO chiosco */}
                            {!isRL && chiosco.stato !== 'offline' && (
                                <button
                                    onClick={toggleMic}
                                    disabled={micLoading}
                                    title={micAttivo ? 'Spegni il microfono verso questo chiosco' : 'Parla con questo chiosco (gli altri non sentono)'}
                                    className="flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-95"
                                    style={{
                                        backgroundColor: micAttivo ? '#22c55e' : 'rgba(59,130,246,0.12)',
                                        color:           micAttivo ? '#052e16' : '#93c5fd',
                                        border:          `1px solid ${micAttivo ? '#22c55e' : 'rgba(59,130,246,0.45)'}`,
                                        boxShadow:       micAttivo ? '0 0 0 4px rgba(34,197,94,0.18)' : 'none',
                                        opacity:         micLoading ? 0.6 : 1,
                                    }}
                                >
                                    <MicIcon />
                                    {micAttivo ? 'Microfono acceso' : call?.gestitaDa === 'ai' ? 'Parla (subentra all\'AI)' : 'Parla col chiosco'}
                                </button>
                            )}
                            <div className="flex items-center gap-2" style={{ fontSize: '11px', color: '#5c6380' }}>
                                <span className="uppercase font-mono">{chiosco.tipo}</span>
                                {chiosco.has_pos && <span>POS</span>}
                                {chiosco.has_stampante && <span>🖨</span>}
                            </div>
                        </div>
                    </div>

                    {/* Barra chiamata: Riprendi (se in attesa) / editor messaggio (se in gestione) */}
                    {call && (chiosco.stato === 'in_chiaro' || chiosco.stato === 'in_nascosto' || chiosco.stato === 'in_parlato') && (
                        <div className="flex items-center gap-3 px-4 py-2 shrink-0"
                             style={{ borderBottom: '1px solid var(--color-border)',
                                      backgroundColor: call.attiva ? 'rgba(59,130,246,0.06)' : 'rgba(245,158,11,0.10)' }}>
                            {call.attiva ? (
                                <>
                                    <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                                        Messaggio di attesa:
                                    </span>
                                    <input
                                        type="text"
                                        value={snap.messaggioAttesa}
                                        onChange={(e) => liveKitCall.setMessaggioAttesa(e.target.value)}
                                        placeholder="Un momento e sono subito da lei"
                                        className="flex-1 rounded px-2 py-1 text-xs outline-none"
                                        style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                                    />
                                    <span className="text-xs shrink-0" style={{ color: 'var(--color-text-muted)' }}>
                                        (mostrato agli altri chioschi quando passi a un'altra chiamata)
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="flex items-center gap-1.5 text-xs font-semibold shrink-0" style={{ color: '#f59e0b' }}>
                                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#f59e0b' }} />
                                        Chiamata in attesa
                                    </span>
                                    <span className="flex-1 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                        Stai gestendo un altro chiosco. Premi Riprendi per tornare su questo.
                                    </span>
                                    <button
                                        onClick={() => liveKitCall.setActive(chiosco.id)}
                                        className="shrink-0 rounded px-3 py-1.5 text-xs font-semibold"
                                        style={{ backgroundColor: '#22c55e', color: '#fff' }}>
                                        Riprendi
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {/* Corpo principale */}
                    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">

                        {/* ── OFFLINE ── */}
                        {chiosco.stato === 'offline' && (
                            <div className="text-center">
                                <div className="mx-auto mb-3 rounded-full flex items-center justify-center"
                                     style={{ width: 64, height: 64, backgroundColor: 'rgba(92,99,128,0.1)', border: '2px solid var(--color-border)' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                                        <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                    </svg>
                                </div>
                                <p className="font-medium" style={{ color: '#5c6380' }}>Chiosco non connesso</p>
                                <p className="text-xs mt-1" style={{ color: '#3a3f55' }}>
                                    Il kiosk agent non è in esecuzione o non ha ancora registrato presenza.
                                </p>
                            </div>
                        )}

                        {/* ── Video live (presenza) — sempre, finché non c'è una sessione media ── */}
                        {['idle', 'in_chiamata', 'messaggio_attesa'].includes(chiosco.stato) && (
                            <div className="w-full flex flex-col items-center gap-2" style={{ maxWidth: 720 }}>
                                <div className="relative w-full rounded-xl overflow-hidden"
                                     style={{ aspectRatio: '16/9', backgroundColor: '#060810',
                                              border: `2px solid ${micAttivo ? '#22c55e' : 'var(--color-border)'}`,
                                              boxShadow: micAttivo ? '0 0 0 6px rgba(34,197,94,0.15)' : 'none' }}>
                                    <video ref={presenzaVideoRef} autoPlay muted playsInline
                                           className="absolute inset-0 w-full h-full" style={{ objectFit: 'cover', display: presenzaTrack ? 'block' : 'none' }} />
                                    {!presenzaTrack && (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5">
                                                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                                            </svg>
                                            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                                Video del chiosco non disponibile (schermata chiosco chiusa o webcam negata)
                                            </p>
                                        </div>
                                    )}
                                    <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded px-2 py-0.5"
                                         style={{ backgroundColor: 'rgba(6,8,16,0.6)', fontSize: '10px', color: '#e2e8f0' }}>
                                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: presenzaTrack ? '#22c55e' : '#5c6380' }} />
                                        LIVE · {chiosco.nome}
                                    </div>
                                    {micAttivo && (
                                        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded px-2 py-1"
                                             style={{ backgroundColor: 'rgba(34,197,94,0.95)', fontSize: '11px', fontWeight: 700, color: '#052e16' }}>
                                            <MicIcon /> Stai parlando con il chiosco — l'ospite ti sente e tu senti lui
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── IDLE: opzioni di collegamento (secondarie rispetto al microfono) ── */}
                        {chiosco.stato === 'idle' && (
                            <div className="text-center w-full max-w-sm">
                                <p className="text-xs mb-3" style={{ color: 'var(--color-text-muted)' }}>
                                    {isRL
                                        ? 'Avvia un monitoraggio nascosto del chiosco.'
                                        : 'Per due parole veloci usa il microfono in alto. Collegamento completo (voce e video, documenti, condivisione):'}
                                </p>
                                <div className="flex gap-3 justify-center flex-wrap">
                                    {!isRL && chiosco.interattivo && (
                                        <AzioneBtn
                                            label="Parla col chiosco"
                                            color="#3b82f6"
                                            onClick={avviaParlato}
                                            loading={loading}
                                            icon={<MicIcon />}
                                        />
                                    )}
                                    <AzioneBtn
                                        label="Collegamento nascosto"
                                        color="#eab308"
                                        onClick={() => transizione('in_nascosto')}
                                        loading={loading}
                                        icon={<EyeOffIcon />}
                                    />
                                    {!isRL && (
                                        <AzioneBtn
                                            label="Messaggio attesa"
                                            color="#9ba3c0"
                                            onClick={onApriMessaggio}
                                            loading={loading}
                                            icon={<MsgIcon />}
                                        />
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── CHIAMATA IN ARRIVO ── */}
                        {chiosco.stato === 'in_chiamata' && (
                            <div className="text-center w-full max-w-sm">
                                <div className="relative mx-auto mb-5" style={{ width: 80, height: 80 }}>
                                    <div className="absolute inset-0 rounded-full animate-pulse-ring"
                                         style={{ border: '2px solid #ef4444', opacity: 0.4 }} />
                                    <div className="absolute inset-0 rounded-full animate-pulse-ring"
                                         style={{ border: '2px solid #ef4444', opacity: 0.2, animationDelay: '0.4s' }} />
                                    <div className="absolute inset-0 rounded-full flex items-center justify-center"
                                         style={{ backgroundColor: 'rgba(239,68,68,0.15)', border: '2px solid rgba(239,68,68,0.5)' }}>
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="#ef4444" className="animate-blink">
                                            <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/>
                                        </svg>
                                    </div>
                                </div>
                                <p className="font-bold mb-1 animate-blink" style={{ color: '#ef4444', fontSize: '16px' }}>
                                    CHIAMATA IN ARRIVO
                                </p>
                                <p className="text-sm mb-6" style={{ color: 'var(--color-text-secondary)' }}>
                                    {chiosco.nome}
                                </p>
                                {isRL ? (
                                    /* RL: solo documentativo — nessuna azione consentita */
                                    <div className="rounded-lg border px-4 py-3 text-center"
                                         style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(92,99,128,0.06)' }}>
                                        <p className="text-xs" style={{ color: '#5c6380' }}>
                                            Solo visualizzazione · la risposta spetta al Receptionist
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 justify-center flex-wrap">
                                        {chiosco.interattivo && (
                                            <AzioneBtn
                                                label="Rispondi"
                                                color="#22c55e"
                                                onClick={avviaParlato}
                                                loading={loading}
                                                icon={<MicIcon />}
                                            />
                                        )}
                                        <AzioneBtn
                                            label="Rispondi nascosto"
                                            color="#eab308"
                                            onClick={() => transizione('in_nascosto')}
                                            loading={loading}
                                            icon={<EyeOffIcon />}
                                        />
                                        <AzioneBtn
                                            label="Ignora"
                                            color="#5c6380"
                                            onClick={() => transizione('idle')}
                                            loading={loading}
                                            icon={<XIcon />}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── IN CHIARO ── */}
                        {chiosco.stato === 'in_chiaro' && (
                            <div className="w-full flex flex-col items-center gap-4">
                                <CollegamentoView
                                    localVideoRef={localVideoRef}
                                    remoteVideoRef={remoteVideoRef}
                                    stato={statoCollegamento}
                                    errore={erroreMedia}
                                    tipo="chiaro"
                                    mostraLocale={true}
                                />
                                {isRL ? (
                                    /* RL: solo visualizzazione — nessuna azione consentita in in_chiaro */
                                    <div className="rounded-lg border px-4 py-3 text-center"
                                         style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(92,99,128,0.06)' }}>
                                        <p className="text-xs" style={{ color: '#5c6380' }}>
                                            Solo visualizzazione · nessuna azione consentita
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 flex-wrap justify-center">
                                        {chiosco.interattivo && (
                                            <AzioneBtn
                                                label="Avvia parlato"
                                                color="#3b82f6"
                                                onClick={avviaParlato}
                                                loading={loading}
                                                icon={<MicIcon />}
                                            />
                                        )}
                                        {call?.attiva && call?.stato === 'connected' && (
                                            snap.condivisioneLocale ? (
                                                <AzioneBtn
                                                    label="Ferma condivisione"
                                                    color="#f59e0b"
                                                    onClick={() => liveKitCall.stopScreenShare()}
                                                    loading={false}
                                                    icon={<ScreenStopIcon />}
                                                />
                                            ) : (
                                                <AzioneBtn
                                                    label="Condividi schermo"
                                                    color="#8b5cf6"
                                                    onClick={() => liveKitCall.startScreenShare()}
                                                    loading={false}
                                                    icon={<ScreenIcon />}
                                                />
                                            )
                                        )}
                                        {call?.attiva && call?.stato === 'connected' && (
                                            <AzioneBtn
                                                label="Acquisisci documento"
                                                color="#3b82f6"
                                                onClick={() => setShowCattura(true)}
                                                loading={false}
                                                icon={<DocIcon />}
                                            />
                                        )}
                                        <AzioneBtn
                                            label="Passa a nascosto"
                                            color="#eab308"
                                            onClick={() => transizione('in_nascosto')}
                                            loading={loading}
                                            icon={<EyeOffIcon />}
                                        />
                                        <AzioneBtn
                                            label="Messaggio attesa"
                                            color="#9ba3c0"
                                            onClick={onApriMessaggio}
                                            loading={loading}
                                            icon={<MsgIcon />}
                                        />
                                        <AzioneBtn
                                            label="Chiudi collegamento"
                                            color="#ef4444"
                                            onClick={() => transizione('idle')}
                                            loading={loading}
                                            icon={<XIcon />}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── IN NASCOSTO ── */}
                        {chiosco.stato === 'in_nascosto' && (
                            <div className="w-full flex flex-col items-center gap-4">
                                <CollegamentoView
                                    localVideoRef={localVideoRef}
                                    remoteVideoRef={remoteVideoRef}
                                    stato={statoCollegamento}
                                    errore={erroreMedia}
                                    tipo="nascosto"
                                    mostraLocale={false}
                                />
                                <div className="flex gap-3 flex-wrap justify-center">
                                    {!isRL && chiosco.interattivo && (
                                        <AzioneBtn
                                            label="Parla col chiosco"
                                            color="#3b82f6"
                                            onClick={avviaParlato}
                                            loading={loading}
                                            icon={<MicIcon />}
                                        />
                                    )}
                                    <AzioneBtn
                                        label="Chiudi collegamento"
                                        color="#ef4444"
                                        onClick={() => transizione('idle')}
                                        loading={loading}
                                        icon={<XIcon />}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── IN PARLATO gestito dall'AI — monitoraggio nascosto ── */}
                        {chiosco.stato === 'in_parlato' && call?.gestitaDa === 'ai' && (
                            <div className="w-full flex flex-col items-center gap-4">
                                <CollegamentoView
                                    localVideoRef={localVideoRef}
                                    remoteVideoRef={remoteVideoRef}
                                    stato={statoCollegamento}
                                    errore={erroreMedia}
                                    tipo="nascosto"
                                    mostraLocale={false}
                                />
                                <div className="rounded-lg border px-4 py-3 text-center"
                                     style={{ borderColor: 'rgba(139,92,246,0.4)', backgroundColor: 'rgba(139,92,246,0.08)' }}>
                                    <p className="text-xs" style={{ color: '#c4b5fd' }}>
                                        Self check-in condotto dal receptionist AI · stai osservando in nascosto (audio e video)
                                    </p>
                                </div>
                                {!isRL && (
                                    <div className="flex gap-3 flex-wrap justify-center">
                                        <AzioneBtn
                                            label="Subentra"
                                            color="#22c55e"
                                            onClick={subentraAi}
                                            loading={loading}
                                            icon={<MicIcon />}
                                        />
                                        <AzioneBtn
                                            label="Termina sessione AI"
                                            color="#ef4444"
                                            onClick={terminaAi}
                                            loading={loading}
                                            icon={<XIcon />}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ── IN PARLATO — WebRTC ── */}
                        {chiosco.stato === 'in_parlato' && call?.gestitaDa !== 'ai' && (
                            <div className="w-full flex flex-col items-center gap-4">
                                <ParlatoView
                                    localVideoRef={localVideoRef}
                                    remoteVideoRef={remoteVideoRef}
                                    stato={statoCollegamento}
                                    errore={erroreMedia}
                                    condivisioneSchermo={snap.condivisioneLocale}
                                />
                                <div className="flex gap-3 flex-wrap justify-center">
                                    {/* Condivisione schermo — solo quando connesso */}
                                    {call?.attiva && call?.stato === 'connected' && (
                                        snap.condivisioneLocale ? (
                                            <AzioneBtn
                                                label="Ferma condivisione"
                                                color="#f59e0b"
                                                onClick={() => liveKitCall.stopScreenShare()}
                                                loading={false}
                                                icon={<ScreenStopIcon />}
                                            />
                                        ) : (
                                            <AzioneBtn
                                                label="Condividi schermo"
                                                color="#8b5cf6"
                                                onClick={() => liveKitCall.startScreenShare()}
                                                loading={false}
                                                icon={<ScreenIcon />}
                                            />
                                        )
                                    )}
                                    {call?.attiva && call?.stato === 'connected' && !isRL && (
                                        <AzioneBtn
                                            label="Acquisisci documento"
                                            color="#3b82f6"
                                            onClick={() => setShowCattura(true)}
                                            loading={false}
                                            icon={<DocIcon />}
                                        />
                                    )}
                                    <AzioneBtn
                                        label="Chiudi parlato"
                                        color="#ef4444"
                                        onClick={chiudiParlato}
                                        loading={loading}
                                        icon={<XIcon />}
                                    />
                                </div>
                            </div>
                        )}

                        {/* ── MESSAGGIO ATTESA ── */}
                        {chiosco.stato === 'messaggio_attesa' && (
                            <div className="w-full flex flex-col items-center gap-4 max-w-sm">
                                <div className="rounded-xl border p-5 w-full text-center"
                                     style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(155,163,192,0.06)' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ba3c0" strokeWidth="1.5"
                                         className="mx-auto mb-3">
                                        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                    </svg>
                                    <p className="text-xs uppercase tracking-wide mb-2" style={{ color: '#5c6380' }}>
                                        Messaggio attivo sul chiosco
                                    </p>
                                    {chiosco.messaggio_attesa ? (
                                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                            "{chiosco.messaggio_attesa}"
                                        </p>
                                    ) : (
                                        <p className="text-xs" style={{ color: '#5c6380' }}>(nessun testo)</p>
                                    )}
                                </div>
                                {isRL ? (
                                    /* RL: solo visualizzazione — gestione messaggio non consentita */
                                    <div className="rounded-lg border px-4 py-3 text-center"
                                         style={{ borderColor: 'var(--color-border)', backgroundColor: 'rgba(92,99,128,0.06)' }}>
                                        <p className="text-xs" style={{ color: '#5c6380' }}>
                                            Solo visualizzazione · gestione messaggio non consentita
                                        </p>
                                    </div>
                                ) : (
                                    <div className="flex gap-3 flex-wrap justify-center">
                                        <AzioneBtn
                                            label="Modifica messaggio"
                                            color="#9ba3c0"
                                            onClick={onApriMessaggio}
                                            loading={loading}
                                            icon={<MsgIcon />}
                                        />
                                        <AzioneBtn
                                            label="Parla col chiosco"
                                            color="#3b82f6"
                                            onClick={avviaParlato}
                                            loading={loading}
                                            icon={<MicIcon />}
                                        />
                                        <AzioneBtn
                                            label="Chiudi messaggio"
                                            color="#ef4444"
                                            onClick={() => transizione('idle')}
                                            loading={loading}
                                            icon={<XIcon />}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        {ascoltoErrore && (
                            <p className="text-xs rounded px-3 py-1.5"
                               style={{ color: '#fde68a', backgroundColor: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)' }}>
                                {ascoltoErrore}
                            </p>
                        )}

                        {/* Errore transizione */}
                        {errore && (
                            <p className="text-xs rounded px-3 py-1.5"
                               style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)' }}>
                                {errore}
                            </p>
                        )}
                    </div>
                </>
            )}

            {showCattura && <CatturaDocumento onClose={() => setShowCattura(false)} />}
        </div>
    );
}

// ── Componenti interni ─────────────────────────────────────────────────────

function NessunaSeleziona() {
    return (
        <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-border)" strokeWidth="1.5">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
            </svg>
            <p className="text-sm" style={{ color: '#3a3f55' }}>
                Seleziona un chiosco dalla griglia
            </p>
        </div>
    );
}

