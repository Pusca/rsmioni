import { RefObject, useEffect, useLayoutEffect, useState } from 'react';

/**
 * Inquadratura del documento, uguale sul chiosco e in portineria.
 *
 * Il problema che risolve: il chiosco mostrava la propria camera a schermo
 * pieno con object-fit cover (ritagliata, soprattutto su un totem verticale)
 * e la cornice guida era una frazione dello SCHERMO; il receptionist invece
 * vede il fotogramma intero. Un documento che riempiva la cornice sul chiosco
 * arrivava piccolo e lontano in portineria.
 *
 * Qui il fotogramma si mostra sempre per intero (object-fit contain) in un
 * riquadro con il rapporto reale del video, e la cornice è una frazione del
 * FOTOGRAMMA: le due parti vedono la stessa cosa.
 */

/** Rapporto di una carta d'identità / patente (ISO 7810 ID-1). */
export const RAPPORTO_DOCUMENTO = 1.586;
/** Larghezza della cornice rispetto al fotogramma. */
export const LARGHEZZA_CORNICE = 0.72;

export interface Box { left: number; top: number; width: number; height: number }

/** Rapporto larghezza/altezza del flusso video (4/3 finché non è noto). */
export function useRapportoVideo(videoRef: RefObject<HTMLVideoElement | null>, attivo = true): number {
    const [rapporto, setRapporto] = useState(4 / 3);

    useEffect(() => {
        if (!attivo) return;
        const leggi = () => {
            const v = videoRef.current;
            if (v && v.videoWidth && v.videoHeight) setRapporto(v.videoWidth / v.videoHeight);
        };
        leggi();
        const v = videoRef.current;
        v?.addEventListener('loadedmetadata', leggi);
        v?.addEventListener('resize', leggi);
        // La track può cambiare risoluzione (adaptive stream) senza eventi affidabili
        const timer = setInterval(leggi, 1000);
        return () => {
            v?.removeEventListener('loadedmetadata', leggi);
            v?.removeEventListener('resize', leggi);
            clearInterval(timer);
        };
    }, [videoRef, attivo]);

    return rapporto;
}

/** Riquadro, dentro il contenitore, in cui il fotogramma sta per intero e centrato. */
export function useBoxFotogramma(contenitoreRef: RefObject<HTMLElement | null>, rapporto: number, attivo = true): Box | null {
    const [box, setBox] = useState<Box | null>(null);

    useLayoutEffect(() => {
        if (!attivo) { setBox(null); return; }
        const el = contenitoreRef.current;
        if (!el) return;
        const calcola = () => {
            const W = el.clientWidth, H = el.clientHeight;
            if (!W || !H) return;
            let width = W, height = W / rapporto;
            if (height > H) { height = H; width = H * rapporto; }
            setBox({ left: (W - width) / 2, top: (H - height) / 2, width, height });
        };
        calcola();
        const osservatore = new ResizeObserver(calcola);
        osservatore.observe(el);
        return () => osservatore.disconnect();
    }, [contenitoreRef, rapporto, attivo]);

    return box;
}

/** Stile per il <video> che deve occupare esattamente il box del fotogramma. */
export function stileVideoNelBox(box: Box | null, sfondo = '#050710'): React.CSSProperties {
    return box
        ? { position: 'absolute', left: box.left, top: box.top, width: box.width, height: box.height, objectFit: 'contain', backgroundColor: sfondo }
        : { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'contain', backgroundColor: sfondo };
}

/**
 * Cornice guida tratteggiata, in proporzione al fotogramma (non allo schermo).
 * `scuro` oscura tutto ciò che sta fuori dalla cornice (sul chiosco).
 */
export function CorniceDocumento({ box, testo, scuro = true }: { box: Box | null; testo?: string; scuro?: boolean }) {
    if (!box) return null;
    const larghezza = Math.min(box.width * LARGHEZZA_CORNICE, box.height * 0.86 * RAPPORTO_DOCUMENTO);
    const altezza   = larghezza / RAPPORTO_DOCUMENTO;

    return (
        <div className="absolute pointer-events-none z-10"
             style={{ left: box.left, top: box.top, width: box.width, height: box.height, overflow: 'hidden' }}>
            <div className="absolute"
                 style={{
                     left: (box.width - larghezza) / 2, top: (box.height - altezza) / 2,
                     width: larghezza, height: altezza,
                     border: `${scuro ? 3 : 2}px dashed rgba(255,255,255,${scuro ? 0.85 : 0.6})`, borderRadius: 12,
                     boxShadow: scuro ? '0 0 0 9999px rgba(0,0,0,0.35)' : undefined,
                 }}>
                {testo && (
                    <span className="absolute left-0 right-0 text-center font-medium"
                          style={{ top: 8, fontSize: Math.max(12, Math.min(18, larghezza / 24)), color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
                        {testo}
                    </span>
                )}
            </div>
        </div>
    );
}
