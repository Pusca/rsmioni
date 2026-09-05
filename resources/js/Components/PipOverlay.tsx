import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, usePage } from '@inertiajs/react';
import { useLiveKitCall } from '@/hooks/useLiveKitCall';
import * as liveKitCall from '@/services/liveKitCall';
import { cambiaStato } from '@/services/portineriaApi';
import CatturaDocumento from './Portineria/CatturaDocumento';

/**
 * Riquadro video flottante (PiP) mostrato quando una videochiamata LiveKit è
 * attiva e l'utente NON è sulla pagina Portineria (la chiamata persiste navigando,
 * es. su /prenotazioni). Legge dal gestore singleton liveKitCall.
 *
 * Si può TRASCINARE (barra in alto o video) e RIDURRE a una barretta, così
 * non copre mai la parte di pagina che serve. La posizione viene ricordata
 * nel browser del receptionist e resta dentro la finestra anche se questa
 * viene ridimensionata.
 */

const LARGHEZZA = 280;
const ALTEZZA_VIDEO = 210;
const MARGINE = 8;
const KEY_POS = 'pip_pos';
const KEY_MIN = 'pip_min';

interface Pos { x: number; y: number }

function leggiPos(): Pos | null {
    try {
        const raw = localStorage.getItem(KEY_POS);
        if (!raw) return null;
        const p = JSON.parse(raw) as Pos;
        return Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null;
    } catch { return null; }
}
function salvaPos(p: Pos): void { try { localStorage.setItem(KEY_POS, JSON.stringify(p)); } catch { /* ignore */ } }
function leggiMin(): boolean { try { return localStorage.getItem(KEY_MIN) === '1'; } catch { return false; } }
function salvaMin(v: boolean): void { try { localStorage.setItem(KEY_MIN, v ? '1' : '0'); } catch { /* ignore */ } }

/** Tiene il riquadro dentro la finestra (la sua altezza reale la misuriamo dal DOM). */
function dentroFinestra(p: Pos, h: number): Pos {
    const maxX = Math.max(MARGINE, window.innerWidth  - LARGHEZZA - MARGINE);
    const maxY = Math.max(MARGINE, window.innerHeight - h - MARGINE);
    return { x: Math.min(Math.max(MARGINE, p.x), maxX), y: Math.min(Math.max(MARGINE, p.y), maxY) };
}

/** Posizione iniziale: quella ricordata, altrimenti in basso a destra. */
function posIniziale(): Pos {
    return leggiPos() ?? { x: window.innerWidth - LARGHEZZA - 20, y: window.innerHeight - ALTEZZA_VIDEO - 110 };
}

export default function PipOverlay() {
    const snap     = useLiveKitCall();
    const videoRef = useRef<HTMLVideoElement>(null);
    const boxRef   = useRef<HTMLDivElement>(null);
    const currentUrl = usePage().url;
    const [showCattura, setShowCattura] = useState(false);

    // ── Posizione, trascinamento, riduzione ────────────────────────────────
    const [pos, setPos] = useState<Pos>(() => (typeof window === 'undefined' ? { x: 20, y: 20 } : posIniziale()));
    const [ridotto, setRidotto] = useState<boolean>(() => leggiMin());
    const [trascinando, setTrascinando] = useState(false);
    const dragRef = useRef<{ dx: number; dy: number; mosso: boolean } | null>(null);

    const altezzaBox = () => boxRef.current?.offsetHeight ?? (ALTEZZA_VIDEO + 90);

    const onPointerDown = useCallback((e: React.PointerEvent) => {
        // Solo tasto principale; i bottoni dentro la barra non avviano il drag
        if (e.button !== 0 || (e.target as HTMLElement).closest('button, a')) return;
        dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y, mosso: false };
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        setTrascinando(true);
        e.preventDefault();
    }, [pos]);

    const onPointerMove = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        if (!d) return;
        d.mosso = true;
        setPos(dentroFinestra({ x: e.clientX - d.dx, y: e.clientY - d.dy }, altezzaBox()));
    }, []);

    const onPointerUp = useCallback((e: React.PointerEvent) => {
        const d = dragRef.current;
        dragRef.current = null;
        setTrascinando(false);
        try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* ignore */ }
        if (d?.mosso) setPos((p) => { const c = dentroFinestra(p, altezzaBox()); salvaPos(c); return c; });
    }, []);

    // Finestra ridimensionata: il riquadro resta visibile
    useEffect(() => {
        const onResize = () => setPos((p) => dentroFinestra(p, altezzaBox()));
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Cambiando tra ridotto ed esteso l'altezza cambia: si ricontrolla il bordo
    useEffect(() => { setPos((p) => dentroFinestra(p, altezzaBox())); }, [ridotto]);

    const toggleRidotto = () => setRidotto((v) => { salvaMin(!v); return !v; });

    // Il PiP mostra la chiamata ATTIVA
    const call = snap.activeChioscoId ? snap.calls[snap.activeChioscoId] : undefined;
    const onPortineria = currentUrl.startsWith('/portineria');
    const attivo = !!call && (call.stato === 'connecting' || call.stato === 'connected');

    // Aggancia la track remota dell'attiva al video del PiP (anche al ritorno da "ridotto")
    useEffect(() => {
        if (videoRef.current) liveKitCall.attachRemote(videoRef.current);
    }, [call?.stato, call?.condivisione, call?.sessionId, call?.remoteVer, ridotto]);

    if (!attivo || onPortineria || !call) return null;

    const colore = call.tipo === 'parlato' ? '#3b82f6'
                 : call.tipo === 'nascosto' ? '#eab308'
                 : '#22c55e';
    const tipoLabel = call.tipo === 'parlato' ? 'In parlato'
                    : call.tipo === 'nascosto' ? 'Nascosto'
                    : 'In chiaro';

    const termina = async () => {
        const cid = call.chioscoId;
        await liveKitCall.stopCall(cid);
        try { await cambiaStato(cid, 'idle'); } catch { /* best-effort */ }
    };

    const handleStyle: React.CSSProperties = { cursor: trascinando ? 'grabbing' : 'grab', touchAction: 'none', userSelect: 'none' };

    return (
        <div
            ref={boxRef}
            className="fixed z-50 rounded-xl overflow-hidden shadow-2xl"
            style={{
                left: pos.x, top: pos.y, width: `${LARGHEZZA}px`,
                border: `2px solid ${colore}55`, backgroundColor: '#050710',
                transition: trascinando ? 'none' : 'box-shadow .15s ease',
                boxShadow: trascinando ? `0 0 0 3px ${colore}55, 0 25px 50px rgba(0,0,0,0.5)` : undefined,
            }}
        >
            {/* Barra: chiosco, stato, riduci — è la maniglia per trascinare */}
            <div
                className="flex items-center gap-2 px-2.5 py-1.5"
                style={{ backgroundColor: 'var(--color-bg-card)', borderBottom: ridotto ? 'none' : '1px solid var(--color-border)', ...handleStyle }}
                onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
                title="Trascina per spostare"
            >
                <svg width="10" height="14" viewBox="0 0 10 14" fill="var(--color-text-muted)" aria-hidden="true" className="shrink-0">
                    <circle cx="2.5" cy="2.5" r="1.3" /><circle cx="7.5" cy="2.5" r="1.3" />
                    <circle cx="2.5" cy="7" r="1.3" /><circle cx="7.5" cy="7" r="1.3" />
                    <circle cx="2.5" cy="11.5" r="1.3" /><circle cx="7.5" cy="11.5" r="1.3" />
                </svg>
                <span className="w-1.5 h-1.5 rounded-full animate-pulse shrink-0" style={{ backgroundColor: colore }} />
                <span className="text-xs font-medium truncate flex-1" style={{ color: 'var(--color-text-primary)' }}>
                    {call.chioscoNome ?? 'Chiosco'} <span style={{ color: colore }}>· {tipoLabel}</span>
                </span>
                <button onClick={toggleRidotto} className="rounded px-1.5 py-0.5 text-xs shrink-0"
                        style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}
                        title={ridotto ? 'Mostra il video' : 'Riduci a barra'}>
                    {ridotto ? '▢' : '—'}
                </button>
            </div>

            {!ridotto && (
                <>
                    {/* Video (trascinabile anche da qui) */}
                    <div style={{ width: `${LARGHEZZA}px`, height: `${ALTEZZA_VIDEO}px`, position: 'relative', ...handleStyle }}
                         onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ pointerEvents: 'none' }} />
                    </div>

                    {/* Controlli */}
                    <div className="px-3 py-2" style={{ backgroundColor: 'var(--color-bg-card)', borderTop: '1px solid var(--color-border)' }}>
                        <div className="flex items-center justify-end gap-1.5">
                            {call.stato === 'connected' && (
                                <button onClick={() => setShowCattura(true)} className="rounded px-2 py-1 text-xs font-medium mr-auto"
                                        style={{ color: '#fff', backgroundColor: 'var(--color-parlato)' }}>
                                    Acquisisci documento
                                </button>
                            )}
                            <Link href="/portineria" className="rounded px-2 py-1 text-xs"
                                  style={{ color: 'var(--color-parlato)', border: '1px solid rgba(59,130,246,0.3)' }}>
                                Torna
                            </Link>
                            <button onClick={termina} className="rounded px-2 py-1 text-xs"
                                    style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                                Termina
                            </button>
                        </div>
                    </div>
                </>
            )}

            {showCattura && <CatturaDocumento onClose={() => setShowCattura(false)} />}
        </div>
    );
}
