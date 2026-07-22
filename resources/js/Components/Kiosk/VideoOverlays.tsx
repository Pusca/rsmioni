/**
 * Elementi condivisi delle schermate video del chiosco
 * (CollegamentoChiaroScreen e ParlatoScreen).
 */

/** Stile della miniatura video (angolo basso-destra). */
export const STILE_MINIATURA: React.CSSProperties = {
    bottom: '16px', right: '16px', width: '160px', height: '120px',
    borderRadius: '12px', objectFit: 'cover', zIndex: 20, backgroundColor: '#050710',
    border: '1px solid rgba(255,255,255,0.25)',
};

/** Overlay "un momento e sono subito da lei": il receptionist sta gestendo un altro chiosco. */
export function OverlayAttesa({ messaggio }: { messaggio?: string }) {
    return (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 px-8 text-center"
             style={{ backgroundColor: 'rgba(5,7,16,0.94)' }}>
            <div className="w-12 h-12 rounded-full border-2 border-t-transparent animate-spin"
                 style={{ borderColor: 'rgba(59,130,246,0.35)', borderTopColor: '#3b82f6' }} />
            <div>
                <p className="text-2xl font-light" style={{ color: '#fff' }}>
                    {messaggio || 'Un momento e sono subito da lei'}
                </p>
                <p className="text-base mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Il receptionist la servirà tra pochi istanti
                </p>
            </div>
        </div>
    );
}

/** Cornice/griglia guida per il posizionamento del documento davanti alla camera. */
export function GrigliaDocumento() {
    return (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
            <div className="relative" style={{ width: '70%', maxWidth: 520, aspectRatio: '1.586', border: '3px dashed rgba(255,255,255,0.85)', borderRadius: 12, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}>
                <span className="absolute -top-7 left-0 right-0 text-center text-sm font-medium" style={{ color: '#fff' }}>
                    Posiziona il documento nel riquadro
                </span>
            </div>
        </div>
    );
}
