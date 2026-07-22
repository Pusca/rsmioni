import type { ErroreMedia, StatoCollegamento, TipoCollegamento } from '@/types/media';
import ErroreIcon from './ErroreIcon';

// ── CollegamentoView — video chiosco (chiaro/nascosto) ────────────────────

interface CollegamentoViewProps {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:          StatoCollegamento;
    errore:         ErroreMedia | null;
    tipo:           TipoCollegamento;
    mostraLocale:   boolean; // false per nascosto (receptionist non invia video)
}

export default function CollegamentoView({
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
