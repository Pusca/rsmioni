import { useEffect, useRef } from 'react';

/**
 * Riquadro fisso in alto a destra con la webcam del receptionist — il canale
 * "sempre acceso" (docs/11). Piccolo e discreto: l'ospite vede che dietro il
 * chiosco c'è una persona, senza che il video occupi la schermata.
 *
 * Quando il receptionist accende il microfono verso questo chiosco il
 * riquadro si illumina e la voce si sente; il chiosco accende il proprio
 * microfono su richiesta. Visibile in tutte le schermate tranne i
 * collegamenti pieni (parlato/chiaro umano), dove il receptionist è già
 * grande a schermo.
 */

interface Props {
    track:            MediaStreamTrack;
    nome?:            string | null;
    /** Il receptionist sta parlando con QUESTO chiosco */
    parla?:           boolean;
    /** Il microfono del chiosco è acceso verso il receptionist */
    microfonoAttivo?: boolean;
    /** Autoplay audio negato: serve un tocco */
    audioBloccato?:   boolean;
    /** Se presente, sotto il video compare "Parla con il receptionist" (chiamata dal chiosco) */
    onChiama?:        () => void;
    /** Richiesta inviata, in attesa che il receptionist risponda */
    chiamando?:       boolean;
    /** Lingua dell'etichetta del pulsante */
    lingua?:          string;
}

const TESTO_CHIAMA: Record<string, { chiama: string; attesa: string }> = {
    it: { chiama: 'Parla con il receptionist', attesa: 'Richiesta inviata…' },
    en: { chiama: 'Talk to the receptionist',  attesa: 'Request sent…' },
    de: { chiama: 'Mit der Rezeption sprechen', attesa: 'Anfrage gesendet…' },
    fr: { chiama: 'Parler à la réception',      attesa: 'Demande envoyée…' },
    es: { chiama: 'Hablar con recepción',       attesa: 'Solicitud enviada…' },
};

export default function PresenzaBadge({
    track, nome, parla = false, microfonoAttivo = false, audioBloccato = false,
    onChiama, chiamando = false, lingua = 'it',
}: Props) {
    const t = TESTO_CHIAMA[lingua] ?? TESTO_CHIAMA.it;
    const videoRef = useRef<HTMLVideoElement | null>(null);

    useEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.srcObject = new MediaStream([track]);
        el.play().catch(() => {});
        return () => { el.srcObject = null; };
    }, [track]);

    return (
        <div className={`presenza-badge z-40${parla ? ' presenza-badge-parla' : ''}`}>
            <div className="presenza-badge-frame relative overflow-hidden">
                <video
                    ref={videoRef}
                    autoPlay
                    muted
                    playsInline
                    className="block w-full h-full"
                    style={{ objectFit: 'cover' }}
                />
                {/* Etichetta sul video: chi c'è e cosa succede */}
                <div className="absolute left-0 right-0 bottom-0 flex items-center gap-1.5 px-2.5 py-1.5"
                     style={{ background: 'linear-gradient(180deg, rgba(6,8,16,0), rgba(6,8,16,0.85))' }}>
                    <span className={`w-2 h-2 rounded-full shrink-0${parla ? ' animate-pulse' : ''}`}
                          style={{ backgroundColor: parla ? '#60a5fa' : '#22c55e' }} />
                    <span className="truncate font-medium" style={{ fontSize: 12, color: '#f1f5f9' }}>
                        {parla ? 'La reception ti parla' : `Reception${nome ? ` · ${nome}` : ''}`}
                    </span>
                    {parla && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" className="shrink-0 ml-auto"
                             stroke={microfonoAttivo ? '#86efac' : '#fde68a'}>
                            <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4" />
                        </svg>
                    )}
                </div>
            </div>
            {parla && (
                <p className="presenza-badge-hint text-center mt-1.5"
                   style={{ color: audioBloccato ? '#fbbf24' : '#93c5fd' }}>
                    {audioBloccato ? 'Tocca lo schermo per l\'audio' : microfonoAttivo ? 'Parla pure, ti ascolta' : 'Microfono in attivazione…'}
                </p>
            )}
            {/* Chiamata dal chiosco: la richiesta suona in portineria e il
                receptionist decide se rispondere (parte il parlato) */}
            {onChiama && !parla && (
                <button
                    onClick={onChiama}
                    disabled={chiamando}
                    className={`presenza-badge-btn${chiamando ? ' presenza-badge-btn-attesa' : ''}`}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z" />
                    </svg>
                    <span>{chiamando ? t.attesa : t.chiama}</span>
                </button>
            )}
        </div>
    );
}
