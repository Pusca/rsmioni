import { Chiosco } from '@/types';
import type { ErroreMedia, StatoMediaChiosco } from '@/types/media';
import { STILE_MINIATURA, OverlayAttesa, GrigliaDocumento } from './VideoOverlays';

// ── ParlatoScreen ─────────────────────────────────────────────────────────────

interface ParlatoScreenProps {
    chiosco:            Chiosco;
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoMediaChiosco;
    errore:             ErroreMedia | null;
    condivisioneAttiva: boolean;
    grigliaDoc?:        boolean;
    inAttesa?:          boolean;
    messaggioAttesa?:   string;
}

export default function ParlatoScreen({
    chiosco,
    localVideoRef,
    remoteVideoRef,
    stato,
    errore,
    condivisioneAttiva,
    grigliaDoc,
    inAttesa,
    messaggioAttesa,
}: ParlatoScreenProps) {
    const isConnected = stato === 'connected';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>

            {/* ── Status bar ── */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                 style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: isConnected ? '#3b82f6'
                                                  : stato === 'error' ? '#ef4444'
                                                  : '#5c6380' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {condivisioneAttiva        ? 'Schermo condiviso in corso'
                         : isConnected             ? 'Parlato in corso'
                         : stato === 'connecting'  ? 'Connessione in corso…'
                         : stato === 'error'       ? 'Errore connessione'
                         : 'Negoziazione…'}
                    </span>
                    {condivisioneAttiva && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-medium"
                              style={{ backgroundColor: 'rgba(139,92,246,0.2)', color: '#a78bfa', border: '1px solid rgba(139,92,246,0.4)' }}>
                            SCHERMO
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome}
                </span>
            </div>

            {/* ── Area video — in acquisizione documento la camera del chiosco
                   diventa grande con la cornice guida; il receptionist va in miniatura ── */}
            <div className="flex-1 relative overflow-hidden">
                <video ref={remoteVideoRef} autoPlay playsInline className="absolute"
                       style={grigliaDoc ? STILE_MINIATURA : {
                           top: 0, left: 0, width: '100%', height: '100%',
                           display: isConnected ? 'block' : 'none',
                           objectFit: condivisioneAttiva ? 'contain' : 'cover',
                           backgroundColor: condivisioneAttiva ? '#000' : 'transparent',
                       }} />

                {!isConnected && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-8">
                        <div className="rounded-full flex items-center justify-center shrink-0"
                             style={{ width: 72, height: 72,
                                      backgroundColor: stato === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.08)',
                                      border: `2px solid ${stato === 'error' ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.3)'}` }}>
                            {stato === 'error' ? (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="1.5">
                                    <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                            ) : (
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.5">
                                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                                </svg>
                            )}
                        </div>
                        {errore ? (
                            <div className="text-center max-w-md space-y-2">
                                <p className="text-base font-medium" style={{ color: '#ef4444' }}>
                                    {errore.messaggio}
                                </p>
                                <p className="text-sm leading-relaxed" style={{ color: '#9ba3c0' }}>
                                    {errore.suggerimento}
                                </p>
                            </div>
                        ) : (
                            <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                                Connessione al receptionist in corso…
                            </p>
                        )}
                    </div>
                )}

                {/* Camera chiosco (locale): miniatura, oppure grande in acquisizione */}
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute"
                       style={grigliaDoc
                           ? { top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#050710' }
                           : { ...STILE_MINIATURA, border: '1px solid rgba(59,130,246,0.3)' }} />

                {grigliaDoc && <GrigliaDocumento />}
                {inAttesa && <OverlayAttesa messaggio={messaggioAttesa} />}
            </div>
        </div>
    );
}
