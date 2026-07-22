import { Chiosco } from '@/types';
import type { StatoMediaChiosco } from '@/types/media';
import { STILE_MINIATURA, OverlayAttesa, GrigliaDocumento } from './VideoOverlays';

// ── CollegamentoChiaroScreen ─────────────────────────────────────────────────

interface CollegamentoChiaroScreenProps {
    chiosco:            Chiosco;
    localVideoRef:      React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef:     React.RefObject<HTMLVideoElement | null>;
    stato:              StatoMediaChiosco;
    condivisioneAttiva: boolean;
    grigliaDoc?:        boolean;
    inAttesa?:          boolean;
    messaggioAttesa?:   string;
}

export default function CollegamentoChiaroScreen({
    chiosco,
    localVideoRef,
    remoteVideoRef,
    stato,
    condivisioneAttiva,
    grigliaDoc,
    inAttesa,
    messaggioAttesa,
}: CollegamentoChiaroScreenProps) {
    const isConnected = stato === 'connected';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                 style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: isConnected ? '#22c55e' : '#5c6380' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {isConnected ? 'Collegamento in chiaro' : 'Connessione in corso…'}
                    </span>
                    <span className="ml-1 px-1.5 py-0.5 rounded text-xs"
                          style={{ backgroundColor: 'rgba(34,197,94,0.15)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' }}>
                        CHIARO
                    </span>
                    {condivisioneAttiva && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs animate-pulse"
                              style={{ backgroundColor: 'rgba(59,130,246,0.15)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)' }}>
                            Schermo condiviso
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome}
                </span>
            </div>

            {/* Area video. In acquisizione documento (grigliaDoc) la camera del
                chiosco diventa grande (con la cornice guida) e il receptionist va
                in miniatura: così l'ospite allinea il documento sul feed giusto. */}
            <div className="flex-1 relative overflow-hidden">
                {/* Receptionist (remoto) */}
                <video ref={remoteVideoRef} autoPlay playsInline className="absolute"
                       style={grigliaDoc ? STILE_MINIATURA : {
                           top: 0, left: 0, width: '100%', height: '100%',
                           display: isConnected ? 'block' : 'none',
                           objectFit: condivisioneAttiva ? 'contain' : 'cover',
                           backgroundColor: condivisioneAttiva ? '#000' : 'transparent',
                       }} />

                {/* Camera chiosco (locale) */}
                <video ref={localVideoRef} autoPlay playsInline muted className="absolute"
                       style={grigliaDoc
                           ? { top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', backgroundColor: '#050710' }
                           : { ...STILE_MINIATURA, border: '1px solid rgba(34,197,94,0.3)' }} />

                {grigliaDoc && <GrigliaDocumento />}
                {inAttesa && <OverlayAttesa messaggio={messaggioAttesa} />}

                {!isConnected && !grigliaDoc && !inAttesa && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                        <div className="rounded-full flex items-center justify-center"
                             style={{ width: 72, height: 72,
                                      backgroundColor: 'rgba(34,197,94,0.08)',
                                      border: '2px solid rgba(34,197,94,0.3)' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="1.5">
                                <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2z" />
                            </svg>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                            Collegamento con il receptionist in corso…
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
