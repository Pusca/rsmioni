import type { ErroreMedia, StatoCollegamento } from '@/types/media';
import ErroreIcon from './ErroreIcon';

// ── ParlatoView — video locale + remoto (parlato) ──────────────────────────

interface ParlatoViewProps {
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoCollegamento;
    errore:             ErroreMedia | null;
    condivisioneSchermo: boolean;
}

export default function ParlatoView({ localVideoRef, remoteVideoRef, stato, errore, condivisioneSchermo }: ParlatoViewProps) {
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
