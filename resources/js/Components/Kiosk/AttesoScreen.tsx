import { router } from '@inertiajs/react';
import { Chiosco } from '@/types';
import Bandiera from './Bandiera';

// ── AttesoScreen ─────────────────────────────────────────────────────────────
// Mostrata in idle e in_nascosto (monitoraggio silenzioso: il guest non sa nulla).
//
// Il receptionist, quando è online, sta nel riquadro piccolo in alto a destra
// (PresenzaBadge, montato dalla pagina): qui la scena è per l'ospite —
// benvenuto, scelta della lingua, le tre azioni.

export interface PresenzaProps {
    track:           MediaStreamTrack | null;
    nome:            string | null;
    parla:           boolean;
    microfonoAttivo: boolean;
    audioBloccato:   boolean;
}

type Scopo = 'checkin' | 'checkout' | 'info';

interface AttesoScreenProps {
    chiosco:   Chiosco;
    presenza:  PresenzaProps;
    onAvviaAi: (scopo: Scopo) => void;
    aiLoading: Scopo | null;
    aiErrore:  string | null;
    /** Lingue abilitate per l'hotel (ISO 639-1); con una sola non si mostra la scelta */
    lingue:    string[];
    lingua:    string;
    onLingua:  (lingua: string) => void;
}

/** Nome nativo delle lingue supportate dall'assistente. */
const NOMI_LINGUE: Record<string, string> = {
    it: 'Italiano', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español',
};

/** Testi della schermata nella lingua scelta (l'assistente risponderà in quella). */
interface Testi {
    benvenuto: string; hint: string; lingua: string; attesa: string;
    checkin: string; checkinSub: string;
    checkout: string; checkoutSub: string;
    info: string; infoSub: string;
}
const TESTI: Record<string, Testi> = {
    it: { benvenuto: 'Benvenuto',   hint: 'Scegli la lingua e tocca un pulsante per iniziare', lingua: 'Lingua',   attesa: 'Un attimo…',
          checkin: 'Esegui il check-in',  checkinSub: 'Arrivo in hotel, documenti e chiave',
          checkout: 'Esegui il check-out', checkoutSub: 'Partenza e saldo',
          info: 'Richiedi informazioni',   infoSub: 'Orari, servizi, come funziona' },
    en: { benvenuto: 'Welcome',     hint: 'Choose your language and tap a button to start',   lingua: 'Language', attesa: 'One moment…',
          checkin: 'Check in',            checkinSub: 'Arrival, documents and key',
          checkout: 'Check out',           checkoutSub: 'Departure and payment',
          info: 'Ask for information',     infoSub: 'Hours, services, how it works' },
    de: { benvenuto: 'Willkommen',  hint: 'Sprache wählen und eine Taste antippen',           lingua: 'Sprache',  attesa: 'Einen Moment…',
          checkin: 'Einchecken',          checkinSub: 'Ankunft, Ausweis und Schlüssel',
          checkout: 'Auschecken',          checkoutSub: 'Abreise und Zahlung',
          info: 'Informationen',           infoSub: 'Zeiten, Services, Ablauf' },
    fr: { benvenuto: 'Bienvenue',   hint: 'Choisissez la langue et touchez un bouton',        lingua: 'Langue',   attesa: 'Un instant…',
          checkin: 'Faire le check-in',   checkinSub: 'Arrivée, pièce d’identité et clé',
          checkout: 'Faire le check-out',  checkoutSub: 'Départ et paiement',
          info: 'Demander des infos',      infoSub: 'Horaires, services, fonctionnement' },
    es: { benvenuto: 'Bienvenido',  hint: 'Elige el idioma y toca un botón para empezar',     lingua: 'Idioma',   attesa: 'Un momento…',
          checkin: 'Hacer el check-in',   checkinSub: 'Llegada, documentos y llave',
          checkout: 'Hacer el check-out',  checkoutSub: 'Salida y pago',
          info: 'Pedir información',       infoSub: 'Horarios, servicios, cómo funciona' },
};

export default function AttesoScreen({ chiosco, onAvviaAi, aiLoading, aiErrore, lingue, lingua, onLingua }: AttesoScreenProps) {
    const handleLogout = () => {
        if (confirm('Disconnettere il chiosco?')) {
            router.post('/logout');
        }
    };

    const t = TESTI[lingua] ?? TESTI.it;

    return (
        <>
            {/* Indicatore connessione — top left */}
            <div className="absolute top-4 left-5 flex items-center gap-2 text-xs z-10">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--color-ok)', boxShadow: '0 0 0 3px rgba(34,197,94,0.18)' }} />
                <span style={{ color: 'var(--color-text-muted)', letterSpacing: '0.04em' }}>{chiosco.hotel?.nome ?? 'Reception'}</span>
            </div>

            {/* Logout — bottom right, quasi invisibile (il riquadro del receptionist sta in alto a destra) */}
            <button
                onClick={handleLogout}
                className="absolute bottom-3 right-3 z-10 rounded p-1.5 transition-opacity"
                style={{ color: 'var(--color-text-muted)', opacity: 0.25 }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.25')}
                title="Disconnetti chiosco"
            >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
                    <line x1="12" y1="2" x2="12" y2="12" />
                </svg>
            </button>

            {/* Sfondo: due aloni morbidi, nessuna immagine */}
            <div className="kiosk-bg-glow kiosk-bg-glow-a" aria-hidden="true" />
            <div className="kiosk-bg-glow kiosk-bg-glow-b" aria-hidden="true" />

            {/* Area principale */}
            <div className="kiosk-atteso w-full h-full flex flex-col items-center justify-center relative">

                <div className="text-center px-8 kiosk-welcome">
                    <h1 className="kiosk-title font-light" style={{ color: 'var(--color-text-primary)', letterSpacing: '-0.01em' }}>
                        {t.benvenuto}
                    </h1>
                    <p className="kiosk-hint" style={{ color: 'var(--color-text-muted)' }}>
                        {t.hint}
                    </p>
                </div>

                {/* Scelta lingua: l'assistente apre e risponde nella lingua toccata */}
                {lingue.length > 1 && (
                    <div className="kiosk-lingue" role="radiogroup" aria-label={t.lingua}>
                        {lingue.map((codice) => {
                            const attiva = codice === lingua;
                            return (
                                <button
                                    key={codice}
                                    role="radio"
                                    aria-checked={attiva}
                                    onClick={() => onLingua(codice)}
                                    disabled={aiLoading !== null}
                                    className={`kiosk-lingua${attiva ? ' kiosk-lingua-attiva' : ''}`}
                                >
                                    <Bandiera codice={codice} size={20} />
                                    <span>{NOMI_LINGUE[codice] ?? codice.toUpperCase()}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {/* Le tre azioni: card grandi, leggibili a due metri */}
                <div className="kiosk-actions">
                    <AzioneCard
                        colore="59,130,246"
                        label={aiLoading === 'checkin' ? t.attesa : t.checkin}
                        sub={t.checkinSub}
                        attesa={aiLoading === 'checkin'}
                        disabled={aiLoading !== null}
                        onClick={() => onAvviaAi('checkin')}
                        icon={
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M3 11.5L12 4l9 7.5" />
                                <path d="M5.5 10v9.5h13V10" />
                                <path d="M9.5 15.5l1.8 1.8 3.6-3.8" />
                            </svg>
                        }
                    />
                    <AzioneCard
                        colore="245,158,11"
                        label={aiLoading === 'checkout' ? t.attesa : t.checkout}
                        sub={t.checkoutSub}
                        attesa={aiLoading === 'checkout'}
                        disabled={aiLoading !== null}
                        onClick={() => onAvviaAi('checkout')}
                        icon={
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M14 4h4a2 2 0 012 2v12a2 2 0 01-2 2h-4" />
                                <path d="M10 8l-4 4 4 4" />
                                <path d="M6 12h9" />
                            </svg>
                        }
                    />
                    <AzioneCard
                        colore="148,163,184"
                        label={aiLoading === 'info' ? t.attesa : t.info}
                        sub={t.infoSub}
                        attesa={aiLoading === 'info'}
                        disabled={aiLoading !== null}
                        onClick={() => onAvviaAi('info')}
                        icon={
                            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="9" />
                                <path d="M12 16v-4.5M12 8h.01" />
                            </svg>
                        }
                    />
                </div>

                {aiErrore && (
                    <p className="mt-6 text-sm rounded-lg px-4 py-2"
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

/** Card azione: icona in un disco colorato, titolo grande, sottotitolo, freccia. */
function AzioneCard({ colore, label, sub, icon, attesa, disabled, onClick }: {
    colore: string; label: string; sub: string; icon: React.ReactNode;
    attesa: boolean; disabled: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={`kiosk-action${attesa ? ' kiosk-action-attesa' : ''}`}
            style={{ ['--c' as string]: colore }}
        >
            <span className="kiosk-action-icon">{icon}</span>
            <span className="kiosk-action-text">
                <span className="kiosk-action-label">{label}</span>
                <span className="kiosk-action-sub">{sub}</span>
            </span>
            <svg className="kiosk-action-arrow" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 6l6 6-6 6" />
            </svg>
        </button>
    );
}
