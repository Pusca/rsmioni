import { useEffect, useRef, useState } from 'react';
import { ChioscoConStato, StatoChiosco, Profilo } from '@/types';
import BadgeStato from './BadgeStato';
import {
    cambiaStato,
    creaSessioneParlato,
    chiudiSessioneParlato,
    creaSessioneCollegamento,
    chiudiSessioneCollegamento,
    type TipoCollegamento,
} from '@/services/portineriaApi';
import type { StatoCollegamento } from '@/hooks/useLiveKitMedia';
import { useLiveKitCall } from '@/hooks/useLiveKitCall';
import * as liveKitCall from '@/services/liveKitCall';
import CatturaDocumento from './CatturaDocumento';
import type { ErroreMedia, TipoErroreMedia } from '@/services/webrtcMedia';

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
                chioscoId: chiosco.id, chioscoNome: chiosco.nome,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chiosco?.id, chiosco?.stato, mediaSessionId, mediaSessionTipo]);

    // parlato
    useEffect(() => {
        if (chiosco && chiosco.stato === 'in_parlato' && sessionId) {
            liveKitCall.startCall({
                sessionId, tipo: 'parlato',
                chioscoId: chiosco.id, chioscoNome: chiosco.nome,
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chiosco?.id, chiosco?.stato, sessionId]);

    // NB: l'attivazione NON è automatica alla selezione. Selezionare un chiosco
    // con chiamata in attesa la MOSTRA (con video), ma per gestirla bisogna
    // premere "Riprendi" → così c'è sempre UNA sola chiamata attiva (in parlato).

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

    // ── Helper: chiudi sessione media attiva (chiaro/nascosto) ─────────────
    const chiudiSessioneMedia = async () => {
        if (!chiosco || !mediaSessionId) return;
        await chiudiSessioneCollegamento(mediaSessionId, chiosco.id);
        setMediaSessionId(null);
        setMediaSessionTipo(null);
    };

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

    // ── Avvia parlato (chiude sessione chiaro, crea sessione parlato) ─────
    const avviaParlato = async () => {
        if (!chiosco || loading) return;

        // Chiudi la sessione chiaro prima di avviare il parlato
        if (mediaSessionId) {
            await chiudiSessioneCollegamento(mediaSessionId, chiosco.id);
            setMediaSessionId(null);
            setMediaSessionTipo(null);
        }

        setLoading(true);
        setErrore(null);
        const res = await creaSessioneParlato(chiosco.id);
        setLoading(false);
        if (res.ok) {
            setSessionId(res.data.session_id);
            onStatoChanged(chiosco.id, 'in_parlato');
        } else {
            setErrore(res.error);
            // Ripristina la sessione chiaro se parlato fallisce
            await avviaSessioneMedia('chiaro');
        }
    };

    // ── Chiudi parlato ─────────────────────────────────────────────────────
    // Il session id viene dal gestore (call.sessionId), perché il sessionId locale
    // è azzerato quando si cambia chiosco: senza questo, "Chiudi parlato" su una
    // chiamata in attesa non faceva nulla.
    //  - chiamata IN GESTIONE → torna in chiaro (continui a vedere il chiosco)
    //  - chiamata IN ATTESA   → chiusura completa (idle), perché la stai spegnendo
    const chiudiParlato = async () => {
        if (!chiosco || loading) return;
        const sid = call?.sessionId ?? sessionId;
        const eraAttiva = call?.attiva ?? true;

        if (snap.condivisioneLocale) liveKitCall.stopScreenShare();
        setLoading(true);
        setErrore(null);

        if (sid) await chiudiSessioneParlato(sid, chiosco.id);
        setSessionId(null);

        if (eraAttiva) {
            // resta collegato in chiaro
            onStatoChanged(chiosco.id, 'in_chiaro');
            setLoading(false);
            await avviaSessioneMedia('chiaro');
        } else {
            // era in attesa → spegni del tutto
            liveKitCall.stopCall(chiosco.id);
            await cambiaStato(chiosco.id, 'idle');
            onStatoChanged(chiosco.id, 'idle');
            setMediaSessionId(null);
            setMediaSessionTipo(null);
            setLoading(false);
        }
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
                        </div>

                        <div className="flex items-center gap-2" style={{ fontSize: '11px', color: '#5c6380' }}>
                            <span className="uppercase font-mono">{chiosco.tipo}</span>
                            {chiosco.has_pos && <span>POS</span>}
                            {chiosco.has_stampante && <span>🖨</span>}
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

                        {/* ── IDLE: opzioni di collegamento ── */}
                        {chiosco.stato === 'idle' && (
                            <div className="text-center w-full max-w-sm">
                                <div className="mx-auto mb-4 rounded-full flex items-center justify-center"
                                     style={{ width: 64, height: 64, backgroundColor: 'rgba(34,197,94,0.08)', border: '2px solid rgba(34,197,94,0.3)' }}>
                                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5">
                                        <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                                    </svg>
                                </div>
                                <p className="font-medium mb-1" style={{ color: 'var(--color-text-primary)' }}>Chiosco disponibile</p>
                                <p className="text-xs mb-6" style={{ color: 'var(--color-text-muted)' }}>
                                    {isRL
                                        ? 'Avvia un monitoraggio nascosto del chiosco.'
                                        : 'Avvia un collegamento per interagire con il chiosco.'}
                                </p>
                                <div className="flex gap-3 justify-center">
                                    {!isRL && chiosco.interattivo && (
                                        <AzioneBtn
                                            label="Collegamento in chiaro"
                                            color="#22c55e"
                                            onClick={() => transizione('in_chiaro')}
                                            loading={loading}
                                            icon={<EyeIcon />}
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
                                                label="Rispondi in chiaro"
                                                color="#22c55e"
                                                onClick={() => transizione('in_chiaro')}
                                                loading={loading}
                                                icon={<EyeIcon />}
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
                                            label="Passa in chiaro"
                                            color="#22c55e"
                                            onClick={() => transizione('in_chiaro')}
                                            loading={loading}
                                            icon={<EyeIcon />}
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

                        {/* ── IN PARLATO — WebRTC ── */}
                        {chiosco.stato === 'in_parlato' && (
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
                                            label="Riprendi in chiaro"
                                            color="#22c55e"
                                            onClick={() => transizione('in_chiaro')}
                                            loading={loading}
                                            icon={<EyeIcon />}
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

function VideoPlaceholder({ colore, label }: { colore: string; label: string }) {
    return (
        <div
            className="w-full rounded-xl flex flex-col items-center justify-center gap-3"
            style={{
                aspectRatio:     '16/9',
                maxHeight:       '240px',
                backgroundColor: '#050710',
                border:          `1px solid ${colore}40`,
            }}
        >
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke={colore} strokeWidth="1" opacity={0.5}>
                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
            </svg>
            <p className="text-xs font-mono" style={{ color: colore + '80' }}>{label}</p>
        </div>
    );
}

// ── CollegamentoView — video chiosco (chiaro/nascosto) ────────────────────

interface CollegamentoViewProps {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:          StatoCollegamento;
    errore:         ErroreMedia | null;
    tipo:           TipoCollegamento;
    mostraLocale:   boolean; // false per nascosto (receptionist non invia video)
}

function CollegamentoView({
    localVideoRef, remoteVideoRef, stato, errore, tipo, mostraLocale,
}: CollegamentoViewProps) {
    const colore = tipo === 'chiaro' ? '#22c55e' : '#eab308';
    const label  = tipo === 'chiaro' ? 'IN CHIARO' : 'IN NASCOSTO';

    return (
        <div className="w-full flex flex-col gap-3">
            {/* Video remoto — chiosco (principale) */}
            <div
                className="w-full rounded-xl relative overflow-hidden"
                style={{
                    aspectRatio:     '16/9',
                    maxHeight:       '240px',
                    backgroundColor: '#050710',
                    border:          `1px solid ${colore}50`,
                }}
            >
                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ display: stato === 'connected' ? 'block' : 'none' }}
                />
                {stato !== 'connected' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                             stroke={colore} strokeWidth="1" opacity={stato === 'error' ? 1 : 0.5}>
                            <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                        </svg>
                        <p className="text-xs font-mono" style={{ color: `${colore}80` }}>
                            {stato === 'waiting_chiosco' ? 'In attesa del chiosco…' :
                             stato === 'connecting'      ? 'Negoziazione video…' :
                             stato === 'error'           ? 'Collegamento fallito' : label}
                        </p>
                    </div>
                )}
                {/* Badge tipo */}
                {stato === 'connected' && (
                    <div
                        className="absolute top-2 left-2 px-2 py-0.5 rounded text-xs font-medium"
                        style={{ backgroundColor: `${colore}25`, border: `1px solid ${colore}50`, color: colore }}
                    >
                        {label}
                    </div>
                )}
            </div>

            {/* Riga info + video locale (solo in_chiaro) */}
            <div className="flex items-start gap-3">
                {mostraLocale && (
                    <div
                        className="rounded-lg overflow-hidden shrink-0"
                        style={{
                            width:           '100px',
                            height:          '72px',
                            backgroundColor: '#050710',
                            border:          '1px solid var(--color-border)',
                        }}
                    >
                        <video
                            ref={localVideoRef}
                            autoPlay
                            playsInline
                            muted
                            className="w-full h-full object-cover"
                        />
                    </div>
                )}
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {stato === 'connected'       ? (tipo === 'chiaro' ? 'Collegamento in chiaro attivo' : 'Monitoraggio in corso') :
                         stato === 'connecting'      ? 'Connessione video in corso…' :
                         stato === 'waiting_chiosco' ? 'In attesa del chiosco…' :
                         stato === 'error'           ? 'Errore collegamento video' : ''}
                    </p>
                    {tipo === 'nascosto' && stato === 'connected' && (
                        <p className="text-xs mt-0.5" style={{ color: '#5c6380' }}>
                            Il chiosco non vede il receptionist
                        </p>
                    )}
                    {errore && (
                        <div className="mt-1.5 rounded p-2 space-y-0.5"
                             style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
                            <div className="flex items-center gap-1.5">
                                <ErroreIcon tipo={errore.tipo} />
                                <p className="text-xs font-medium" style={{ color: '#ef4444' }}>
                                    {errore.messaggio}
                                </p>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: '#9ba3c0' }}>
                                {errore.suggerimento}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── ParlatoView — video locale + remoto WebRTC ─────────────────────────────

interface ParlatoViewProps {
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoCollegamento;
    errore:             ErroreMedia | null;
    condivisioneSchermo: boolean;
}

/** Colore e icona SVG per tipo errore media */
function ErroreIcon({ tipo }: { tipo: TipoErroreMedia }) {
    switch (tipo) {
        case 'permessi_negati':
            // Lucchetto
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
            );
        case 'device_occupato':
            // Webcam barrata
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zM1 1l22 22" />
                </svg>
            );
        case 'device_non_trovato':
            // Punto interrogativo
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ba3c0" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
            );
        case 'condivisione_negata':
            // Schermo barrato
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ba3c0" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4M1 1l22 22" />
                </svg>
            );
        case 'peer_irraggiungibile':
            // Nessuna connessione
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
                </svg>
            );
        case 'timeout_signaling':
            // Orologio
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            );
        default:
            // Triangolo di warning
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
            );
    }
}

function ParlatoView({ localVideoRef, remoteVideoRef, stato, errore, condivisioneSchermo }: ParlatoViewProps) {
    const colore = condivisioneSchermo  ? '#8b5cf6'
                 : stato === 'connected' ? '#3b82f6'
                 : stato === 'error'     ? '#ef4444'
                 : '#5c6380';

    return (
        <div className="w-full flex flex-col gap-3">
            {/* Video remoto (chiosco) — principale */}
            <div
                className="w-full rounded-xl relative overflow-hidden"
                style={{
                    aspectRatio:     '16/9',
                    maxHeight:       '240px',
                    backgroundColor: '#050710',
                    border:          `1px solid ${colore}50`,
                }}
            >
                <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover"
                    style={{ display: stato === 'connected' ? 'block' : 'none' }}
                />
                {stato !== 'connected' && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none"
                             stroke={colore} strokeWidth="1" opacity={0.6}>
                            <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                        </svg>
                        <p className="text-xs font-mono" style={{ color: colore + '80' }}>
                            {stato === 'waiting_chiosco' ? 'In attesa del chiosco…' :
                             stato === 'connecting'      ? 'Negoziazione WebRTC…' :
                             stato === 'error'           ? 'Connessione fallita' : 'Chiosco'}
                        </p>
                    </div>
                )}
                {/* Badge condivisione schermo — visibile solo quando attiva */}
                {condivisioneSchermo && stato === 'connected' && (
                    <div
                        className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium"
                        style={{ backgroundColor: 'rgba(139,92,246,0.25)', border: '1px solid rgba(139,92,246,0.5)', color: '#a78bfa' }}
                    >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <rect x="2" y="3" width="20" height="14" rx="2" />
                            <path d="M8 21h8M12 17v4" />
                        </svg>
                        SCHERMO CONDIVISO
                    </div>
                )}
            </div>

            {/* Video locale (receptionist) — miniatura */}
            <div className="flex items-start gap-3">
                <div
                    className="rounded-lg overflow-hidden shrink-0"
                    style={{
                        width:           '100px',
                        height:          '72px',
                        backgroundColor: '#050710',
                        border:          '1px solid var(--color-border)',
                    }}
                >
                    <video
                        ref={localVideoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {stato === 'connected'       ? 'Parlato attivo' :
                         stato === 'connecting'      ? 'Connessione WebRTC in corso…' :
                         stato === 'waiting_chiosco' ? 'In attesa del chiosco…' :
                         stato === 'error'           ? 'Errore connessione' : ''}
                    </p>
                    {errore && (
                        <div className="mt-1.5 rounded-lg p-2.5 space-y-1"
                             style={{ backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                            <div className="flex items-center gap-1.5">
                                <ErroreIcon tipo={errore.tipo} />
                                <p className="text-xs font-medium" style={{ color: '#ef4444' }}>
                                    {errore.messaggio}
                                </p>
                            </div>
                            <p className="text-xs leading-relaxed" style={{ color: '#9ba3c0' }}>
                                {errore.suggerimento}
                            </p>
                        </div>
                    )}
                    {stato === 'waiting_chiosco' && !errore && (
                        <p className="text-xs mt-0.5" style={{ color: '#5c6380' }}>
                            In attesa che il browser del chiosco si connetta…
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── AzioneBtn ──────────────────────────────────────────────────────────────

interface AzioneBtnProps {
    label: string;
    color: string;
    onClick: () => void;
    loading: boolean;
    icon: React.ReactNode;
}

function AzioneBtn({ label, color, onClick, loading, icon }: AzioneBtnProps) {
    return (
        <button
            onClick={onClick}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg font-medium transition-all"
            style={{
                padding:         '8px 14px',
                fontSize:        '12px',
                color:           loading ? '#5c6380' : color,
                backgroundColor: loading ? 'var(--color-bg-secondary)' : `${color}18`,
                border:          `1px solid ${loading ? 'var(--color-border)' : color + '50'}`,
                cursor:          loading ? 'not-allowed' : 'pointer',
                whiteSpace:      'nowrap',
            }}
        >
            <span style={{ opacity: loading ? 0.4 : 1 }}>{icon}</span>
            {label}
        </button>
    );
}

// ── Icon components ────────────────────────────────────────────────────────

function EyeIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function EyeOffIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24M1 1l22 22" />
        </svg>
    );
}

function MsgIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
    );
}

function MicIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
            <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
        </svg>
    );
}

function XIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ display: 'block' }}>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
    );
}

function ScreenIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4" />
        </svg>
    );
}

function DocIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
            <polyline points="14 2 14 8 20 8" />
        </svg>
    );
}

function ScreenStopIcon() {
    return (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ display: 'block' }}>
            <rect x="2" y="3" width="20" height="14" rx="2" />
            <path d="M8 21h8M12 17v4M9 8l6 6M15 8l-6 6" />
        </svg>
    );
}
