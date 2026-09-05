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
}

export default function PresenzaBadge({ track, nome, parla = false, microfonoAttivo = false, audioBloccato = false }: Props) {
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
        </div>
    );
}
