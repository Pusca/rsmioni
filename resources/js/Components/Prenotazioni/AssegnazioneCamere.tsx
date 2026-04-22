import { router } from '@inertiajs/react';
import { useState } from 'react';
import { Camera, CameraConDisponibilita, Profilo } from '@/types';

interface Props {
    prenotazioneId: string;
    camereAssegnate: Camera[];
    camereDisponibili: CameraConDisponibilita[];
    profilo: Profilo;
    overbooking: boolean;
}

/**
 * Pannello gestione assegnazione camere nella pagina Show di una prenotazione.
 *
 * Mostra:
 * - camere attualmente assegnate
 * - selettore per aggiungere/rimuovere camere disponibili
 * - warning se la camera è occupata (solo se overbooking attivo)
 *
 * Il Receptionist può assegnare camere disponibili.
 * Il Receptionist Lite non vede questo pannello (escluso dal controller via middleware,
 * ma anche qui lo rendiamo no-op per profilo Lite che passasse).
 */
export default function AssegnazioneCamere({
    prenotazioneId,
    camereAssegnate,
    camereDisponibili,
    profilo,
    overbooking,
}: Props) {
    const [selezione, setSelezione] = useState<string[]>(camereAssegnate.map(c => c.id));
    const [processing, setProcessing] = useState(false);

    const isReadOnly = profilo === 'receptionist_lite';

    const toggleCamera = (id: string) => {
        setSelezione(prev =>
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const salva = () => {
        setProcessing(true);
        router.put(
            `/prenotazioni/${prenotazioneId}/camere`,
            { camera_ids: selezione },
            {
                preserveScroll: true,
                onFinish: () => setProcessing(false),
            }
        );
    };

    const hasChanges = JSON.stringify([...selezione].sort()) !== JSON.stringify([...camereAssegnate.map(c => c.id)].sort());

    // Raggruppa per piano
    const pianiMap = new Map<number, CameraConDisponibilita[]>();
    camereDisponibili.forEach(c => {
        const arr = pianiMap.get(c.piano) ?? [];
        arr.push(c);
        pianiMap.set(c.piano, arr);
    });
    const pianiOrdinati = Array.from(pianiMap.entries()).sort(([a], [b]) => a - b);

    if (isReadOnly) return null;

    return (
        <div>
            {/* Camere assegnate (riepilogo) */}
            {camereAssegnate.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                    {camereAssegnate.map(c => (
                        <span key={c.id}
                            className="inline-flex items-center rounded px-2 py-1 text-xs font-medium"
                            style={{ color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)' }}>
                            {c.nome}
                            <span className="ml-1 opacity-60">{c.tipo}</span>
                        </span>
                    ))}
                </div>
            )}

            {camereDisponibili.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                    Nessuna camera prenotabile configurata per questo hotel.
                </p>
            ) : (
                <>
                    {/* Griglia di selezione per piano */}
                    <div className="space-y-3">
                        {pianiOrdinati.map(([piano, camere]) => (
                            <div key={piano}>
                                <p className="text-xs mb-2 font-medium" style={{ color: 'var(--color-text-muted)' }}>
                                    {piano === 0 ? 'Piano terra' : `Piano ${piano}`}
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    {camere.map(c => {
                                        const selezionata  = selezione.includes(c.id);
                                        const occupata     = !c.disponibile;
                                        const consentita   = c.disponibile || overbooking;

                                        return (
                                            <button
                                                key={c.id}
                                                type="button"
                                                onClick={() => consentita && toggleCamera(c.id)}
                                                title={occupata && !overbooking ? 'Camera occupata nel periodo' : undefined}
                                                className="flex items-start gap-2 rounded p-2.5 text-left transition-colors"
                                                style={{
                                                    border:          `1px solid ${selezionata ? 'rgba(34,197,94,0.5)' : occupata && !overbooking ? 'rgba(239,68,68,0.2)' : 'var(--color-border)'}`,
                                                    backgroundColor: selezionata ? 'rgba(34,197,94,0.07)' : occupata && !overbooking ? 'rgba(239,68,68,0.04)' : 'var(--color-bg-primary)',
                                                    cursor:          consentita ? 'pointer' : 'not-allowed',
                                                    opacity:         consentita ? 1 : 0.5,
                                                }}
                                            >
                                                {/* Indicatore selezione */}
                                                <div className="mt-0.5 shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center"
                                                    style={{
                                                        borderColor:     selezionata ? '#22c55e' : 'var(--color-border)',
                                                        backgroundColor: selezionata ? '#22c55e' : 'transparent',
                                                    }}>
                                                    {selezionata && (
                                                        <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5">
                                                            <polyline points="2 6 5 9 10 3" />
                                                        </svg>
                                                    )}
                                                </div>

                                                {/* Info camera */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium text-xs" style={{ color: 'var(--color-text-primary)' }}>
                                                            {c.nome}
                                                        </span>
                                                        {occupata && overbooking && (
                                                            <span className="text-xs rounded px-1.5 py-0.5 font-mono"
                                                                style={{ fontSize: '9px', color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}>
                                                                OB
                                                            </span>
                                                        )}
                                                        {occupata && !overbooking && (
                                                            <span className="text-xs" style={{ color: '#ef4444', fontSize: '9px' }}>occupata</span>
                                                        )}
                                                    </div>
                                                    <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                                                        {c.tipo}
                                                        {c.mq != null && <> · {c.mq} m²</>}
                                                        {lettiBreve(c)}
                                                    </p>
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Azioni */}
                    {hasChanges && (
                        <div className="mt-4 flex items-center gap-3">
                            <button onClick={salva} disabled={processing}
                                className="px-4 py-2 rounded text-xs font-medium"
                                style={{ backgroundColor: 'var(--color-parlato)', color: '#fff', opacity: processing ? 0.6 : 1 }}>
                                {processing ? 'Salvataggio…' : 'Salva assegnazione'}
                            </button>
                            <button
                                onClick={() => setSelezione(camereAssegnate.map(c => c.id))}
                                className="px-3 py-2 rounded text-xs"
                                style={{ color: 'var(--color-text-muted)' }}>
                                Annulla modifiche
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function lettiBreve(c: CameraConDisponibilita): string {
    const parts: string[] = [];
    if (c.letti_matrimoniali) parts.push(`${c.letti_matrimoniali}M`);
    if (c.letti_singoli)      parts.push(`${c.letti_singoli}S`);
    if (c.letti_aggiunti)     parts.push(`${c.letti_aggiunti}A`);
    if (c.culle)              parts.push(`${c.culle}C`);
    return parts.length ? ' · ' + parts.join(' ') : '';
}
