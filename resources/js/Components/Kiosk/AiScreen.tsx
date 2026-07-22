import { useEffect, useRef, useState } from 'react';
import type { AiUiState, CameraOpzione, RiepilogoFinale } from '@/hooks/useLiveKitChiosco';
import type { StatoMediaChiosco } from '@/types/media';
import FaseStepper from './FaseStepper';

// ── AiScreen ─────────────────────────────────────────────────────────────────
// Sessione vocale con il receptionist AI (self check-in o informazioni).
// Nessun avatar: indicatore vocale al centro, autoritratto camera in basso.
// La reception vede/ascolta già la conversazione in nascosto e può intervenire.

interface AiScreenProps {
    scopo:         'checkin' | 'checkout' | 'info';
    statoMedia:    StatoMediaChiosco;
    localVideoRef: React.RefObject<HTMLVideoElement | null>;
    aiUi:          AiUiState;
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
 * Opzioni camera proposte dall'AI: l'ospite le vede con prezzo e
 * caratteristiche mentre l'assistente le descrive, e sceglie a voce.
 */
function CamereOpzioniPanel({ opzioni }: { opzioni: CameraOpzione[] }) {
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
function RiepilogoFinalePanel({ r }: { r: RiepilogoFinale }) {
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

export default function AiScreen({ scopo, statoMedia, localVideoRef, aiUi, audioTrack, onTermina }: AiScreenProps) {
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
