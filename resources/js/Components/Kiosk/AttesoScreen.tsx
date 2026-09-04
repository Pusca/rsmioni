import { useEffect, useRef } from 'react';
import { router } from '@inertiajs/react';
import { Chiosco } from '@/types';

// ── AttesoScreen ─────────────────────────────────────────────────────────────
// Mostrata in idle e in_nascosto (monitoraggio silenzioso: il guest non sa nulla).
//
// Con un receptionist online la sua webcam è GRANDE e centrale (muta): l'ospite
// vede che dietro il chiosco c'è una persona. Quando il receptionist accende il
// microfono verso questo chiosco, il riquadro si accende e si sente la voce.

export interface PresenzaProps {
    track:           MediaStreamTrack | null;
    nome:            string | null;
    parla:           boolean;
    microfonoAttivo: boolean;
    audioBloccato:   boolean;
}

interface AttesoScreenProps {
    chiosco:   Chiosco;
    presenza:  PresenzaProps;
    onAvviaAi: (scopo: 'checkin' | 'checkout' | 'info') => void;
    aiLoading: 'checkin' | 'checkout' | 'info' | null;
    aiErrore:  string | null;
    /** Lingue abilitate per l'hotel (ISO 639-1); con una sola non si mostra la scelta */
    lingue:    string[];
    lingua:    string;
    onLingua:  (lingua: string) => void;
}

/** Bandierina + nome nativo per le lingue supportate dall'assistente. */
const LINGUE: Record<string, { bandiera: string; nome: string }> = {
    it: { bandiera: '🇮🇹', nome: 'Italiano' },
    en: { bandiera: '🇬🇧', nome: 'English' },
    de: { bandiera: '🇩🇪', nome: 'Deutsch' },
    fr: { bandiera: '🇫🇷', nome: 'Français' },
    es: { bandiera: '🇪🇸', nome: 'Español' },
};

/** Etichette dei tre bottoni nella lingua scelta (l'assistente risponderà in quella). */
const TESTI: Record<string, { checkin: string; checkout: string; info: string; hint: string; lingua: string; attesa: string }> = {
    it: { checkin: 'Esegui il check-in',  checkout: 'Esegui il check-out', info: 'Richiedi informazioni', hint: 'Tocca un pulsante per iniziare',    lingua: 'Lingua',   attesa: 'Un attimo…' },
    en: { checkin: 'Check in',            checkout: 'Check out',           info: 'Ask for information',   hint: 'Tap a button to start',             lingua: 'Language', attesa: 'One moment…' },
    de: { checkin: 'Einchecken',          checkout: 'Auschecken',          info: 'Informationen',         hint: 'Tippen Sie, um zu beginnen',         lingua: 'Sprache',  attesa: 'Einen Moment…' },
    fr: { checkin: 'Faire le check-in',   checkout: 'Faire le check-out',  info: 'Demander des infos',    hint: 'Touchez un bouton pour commencer',   lingua: 'Langue',   attesa: 'Un instant…' },
    es: { checkin: 'Hacer el check-in',   checkout: 'Hacer el check-out',  info: 'Pedir información',     hint: 'Toque un botón para empezar',        lingua: 'Idioma',   attesa: 'Un momento…' },
};

export default function AttesoScreen({ chiosco, presenza, onAvviaAi, aiLoading, aiErrore, lingue, lingua, onLingua }: AttesoScreenProps) {
    const handleLogout = () => {
        if (confirm('Disconnettere il chiosco?')) {
            router.post('/logout');
        }
    };

    const online = presenza.track !== null;
    const t = TESTI[lingua] ?? TESTI.it;

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
            <div className="kiosk-atteso w-full h-full flex flex-col items-center justify-center">

                {online ? (
                    <PresenzaGrande presenza={presenza} />
                ) : (
                    <div className="text-center mb-10 px-8">
                        <h1 className="font-light mb-2 kiosk-title" style={{ color: 'var(--color-text-primary)' }}>
                            Benvenuto
                        </h1>
                        <p style={{ fontSize: 16, color: 'var(--color-text-muted)' }}>
                            {lingua === 'it' ? 'Welcome · ' : ''}{t.hint}
                        </p>
                    </div>
                )}

                {/* Scelta lingua: l'assistente apre e risponde nella lingua toccata */}
                {lingue.length > 1 && (
                    <div className="kiosk-lingue flex items-center justify-center flex-wrap gap-2 mb-5">
                        <span className="text-xs uppercase tracking-widest mr-1" style={{ color: 'var(--color-text-muted)' }}>
                            {t.lingua}
                        </span>
                        {lingue.map((codice) => {
                            const l = LINGUE[codice] ?? { bandiera: '🌐', nome: codice.toUpperCase() };
                            const attiva = codice === lingua;
                            return (
                                <button
                                    key={codice}
                                    onClick={() => onLingua(codice)}
                                    disabled={aiLoading !== null}
                                    aria-pressed={attiva}
                                    className="kiosk-lingua rounded-full flex items-center gap-2 transition-all active:scale-95"
                                    style={{
                                        padding:         '10px 16px',
                                        fontSize:        15,
                                        minHeight:       44,
                                        backgroundColor: attiva ? 'rgba(59,130,246,0.22)' : 'rgba(148,163,184,0.08)',
                                        border:          `2px solid ${attiva ? 'rgba(96,165,250,0.85)' : 'rgba(148,163,184,0.25)'}`,
                                        color:           attiva ? '#dbeafe' : 'var(--color-text-secondary)',
                                        fontWeight:      attiva ? 600 : 400,
                                    }}
                                >
                                    <span style={{ fontSize: 20, lineHeight: 1 }}>{l.bandiera}</span>
                                    {l.nome}
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Self check-in / check-out AI — azioni principali del chiosco.
                    Misure e impilamento su schermi stretti: .kiosk-actions in app.css */}
                <div className="kiosk-actions mb-6">
                    <button
                        onClick={() => onAvviaAi('checkin')}
                        disabled={aiLoading !== null}
                        className="kiosk-action rounded-2xl transition-all active:scale-95"
                        style={{
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
                            <span className="kiosk-action-label font-medium" style={{ color: '#93c5fd' }}>
                                {aiLoading === 'checkin' ? t.attesa : t.checkin}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Self check-in</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onAvviaAi('checkout')}
                        disabled={aiLoading !== null}
                        className="kiosk-action rounded-2xl transition-all active:scale-95"
                        style={{
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
                            <span className="kiosk-action-label font-medium" style={{ color: '#fcd34d' }}>
                                {aiLoading === 'checkout' ? t.attesa : t.checkout}
                            </span>
                            <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Check-out &amp; payment</span>
                        </div>
                    </button>

                    <button
                        onClick={() => onAvviaAi('info')}
                        disabled={aiLoading !== null}
                        className="kiosk-action rounded-2xl transition-all active:scale-95"
                        style={{
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
                            <span className="kiosk-action-label font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                                {aiLoading === 'info' ? t.attesa : t.info}
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

/**
 * Il receptionist in grande al centro dello schermo: video muto in attesa;
 * quando parla con questo chiosco il riquadro si accende e compare lo stato
 * del microfono dell'ospite.
 */
function PresenzaGrande({ presenza }: { presenza: PresenzaProps }) {
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !presenza.track) return;
        el.srcObject = new MediaStream([presenza.track]);
        el.play().catch(() => {});
        return () => { el.srcObject = null; };
    }, [presenza.track]);

    const parla = presenza.parla;

    return (
        <div className="kiosk-presenza flex flex-col items-center">
            <div className={`kiosk-presenza-frame relative overflow-hidden${parla ? ' kiosk-presenza-parla' : ''}`}>
                <video ref={videoRef} autoPlay muted playsInline className="block w-full h-full" style={{ objectFit: 'cover' }} />

                {/* Etichetta in basso: chi c'è e cosa succede */}
                <div className="absolute left-0 right-0 bottom-0 flex items-center justify-between gap-3 px-5 py-3"
                     style={{ background: 'linear-gradient(180deg, rgba(6,8,16,0), rgba(6,8,16,0.75))' }}>
                    <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0${parla ? ' animate-pulse' : ''}`}
                              style={{ backgroundColor: parla ? '#60a5fa' : '#22c55e' }} />
                        <span className="truncate font-medium" style={{ fontSize: 17, color: '#f1f5f9' }}>
                            {parla
                                ? 'La reception ti sta parlando'
                                : `Reception${presenza.nome ? ` · ${presenza.nome}` : ''} online`}
                        </span>
                    </div>
                    {parla && (
                        <span className="flex items-center gap-1.5 shrink-0 rounded-full px-3 py-1"
                              style={{ fontSize: 12, color: presenza.microfonoAttivo ? '#bbf7d0' : '#fde68a',
                                       backgroundColor: 'rgba(15,23,42,0.6)', border: '1px solid rgba(148,163,184,0.35)' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4" />
                            </svg>
                            {presenza.microfonoAttivo ? 'Ti sente' : 'Microfono in attivazione…'}
                        </span>
                    )}
                </div>
            </div>

            {parla ? (
                <p className="kiosk-presenza-hint mt-3 text-center" style={{ color: '#93c5fd' }}>
                    Parla pure, la reception ti ascolta
                </p>
            ) : (
                <p className="kiosk-presenza-hint mt-3 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    Benvenuto · Welcome — tocca un pulsante per iniziare
                </p>
            )}

            {parla && presenza.audioBloccato && (
                <div className="mt-2 rounded-lg border px-4 py-2 text-center animate-pulse"
                     style={{ borderColor: 'rgba(245,158,11,0.5)', backgroundColor: 'rgba(245,158,11,0.10)' }}>
                    <p className="text-sm font-medium" style={{ color: '#fbbf24' }}>🔇 Tocca lo schermo per attivare l'audio</p>
                </div>
            )}
        </div>
    );
}
