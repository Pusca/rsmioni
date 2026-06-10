import { useEffect, useRef, useState } from 'react';
import { router } from '@inertiajs/react';
import * as liveKitCall from '@/services/liveKitCall';

/**
 * Acquisizione documento "dal vivo": cattura un fotogramma dal video del chiosco
 * (già in arrivo via LiveKit) e lo salva sulla prenotazione selezionata.
 * Niente seconda webcam, niente schermata separata sul chiosco → immediato.
 */

interface Props {
    onClose: () => void;
    /** Se fornito, la prenotazione è già fissata (dal dettaglio prenotazione) e
        non si mostra il selettore. */
    prenotazioneIdFissa?: string;
}

interface PrenotazioneItem { id: string; label: string; }
type Fase = 'select' | 'capture' | 'preview' | 'uploading' | 'done' | 'error';
type Lato = 'fronte' | 'retro';

function getCsrf(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export default function CatturaDocumento({ onClose, prenotazioneIdFissa }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);

    const [prenotazioni, setPrenotazioni] = useState<PrenotazioneItem[]>([]);
    const [prenotazioneId, setPrenotazioneId] = useState(prenotazioneIdFissa ?? '');
    const [fronteRetro, setFronteRetro] = useState(true);
    const [fase, setFase] = useState<Fase>('select');
    const [lato, setLato] = useState<Lato>('fronte');
    const [snapshot, setSnapshot] = useState<Blob | null>(null);
    const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
    const [errore, setErrore] = useState<string | null>(null);

    // Carica le prenotazioni candidate (solo se non già fissata) + griglia sul chiosco
    useEffect(() => {
        liveKitCall.sendData('doc_capture_on');
        if (!prenotazioneIdFissa) {
            fetch('/portineria/cattura/prenotazioni', { headers: { Accept: 'application/json' } })
                .then(r => r.ok ? r.json() : { prenotazioni: [] })
                .then(d => setPrenotazioni(d.prenotazioni ?? []))
                .catch(() => {});
        }
        return () => { liveKitCall.sendData('doc_capture_off'); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Aggancia il video del chiosco all'anteprima quando si è in cattura
    useEffect(() => {
        if (fase === 'capture' && videoRef.current) liveKitCall.attachRemote(videoRef.current);
    }, [fase]);

    const iniziaCattura = () => {
        if (!prenotazioneId) return;
        setLato('fronte');
        setFase('capture');
    };

    const cattura = async () => {
        const blob = await liveKitCall.captureRemoteFrame();
        if (!blob) { setErrore('Nessun fotogramma disponibile dal video del chiosco.'); setFase('error'); return; }
        setSnapshot(blob);
        setSnapshotUrl(URL.createObjectURL(blob));
        setFase('preview');
    };

    const riprendi = () => {
        if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
        setSnapshot(null);
        setSnapshotUrl(null);
        setFase('capture');
    };

    const salva = async () => {
        if (!snapshot) return;
        setFase('uploading');
        const fd = new FormData();
        fd.append('prenotazione_id', prenotazioneId);
        fd.append('lato', lato);
        fd.append('tipo_documento', 'carta_identita');
        fd.append('file', new File([snapshot], `documento-${lato}.jpg`, { type: 'image/jpeg' }));

        try {
            const res = await fetch('/portineria/cattura/documento', {
                method: 'POST',
                headers: { 'X-CSRF-TOKEN': getCsrf(), Accept: 'application/json' },
                body: fd,
            });
            if (!res.ok) throw new Error('upload');

            if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
            setSnapshot(null); setSnapshotUrl(null);

            if (fronteRetro && lato === 'fronte') {
                setLato('retro');
                setFase('capture');
            } else {
                setFase('done');
                // Ricarica i documenti se siamo sul dettaglio prenotazione
                router.reload({ only: ['documenti'] });
                setTimeout(onClose, 1500);
            }
        } catch {
            setErrore('Errore nel salvataggio del documento.');
            setFase('error');
        }
    };

    const latoLabel = lato === 'fronte' ? 'FRONTE' : 'RETRO';

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
             onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-md rounded-xl p-5 shadow-2xl"
                 style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>

                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Acquisisci documento dal collegamento
                    </h2>
                    <button onClick={onClose} className="text-xs rounded px-2 py-1"
                            style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>✕</button>
                </div>

                {/* SELECT */}
                {fase === 'select' && (
                    <div className="space-y-3">
                        {!prenotazioneIdFissa && (
                            <div>
                                <label className="block text-xs mb-1" style={{ color: 'var(--color-text-muted)' }}>Prenotazione *</label>
                                <select value={prenotazioneId} onChange={e => setPrenotazioneId(e.target.value)}
                                    className="w-full rounded px-3 py-2 text-xs outline-none"
                                    style={{ backgroundColor: 'var(--color-bg-primary)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}>
                                    <option value="">— Seleziona prenotazione —</option>
                                    {prenotazioni.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                                </select>
                            </div>
                        )}
                        {prenotazioneIdFissa && (
                            <p className="text-xs rounded px-3 py-2" style={{ color: 'var(--color-text-secondary)', backgroundColor: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)' }}>
                                Il documento sarà salvato in questa prenotazione. Serve un collegamento video attivo col chiosco.
                            </p>
                        )}
                        <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input type="checkbox" checked={fronteRetro} onChange={e => setFronteRetro(e.target.checked)}
                                   className="w-4 h-4 rounded" style={{ accentColor: '#3b82f6' }} />
                            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Acquisisci fronte e retro</span>
                        </label>
                        <p className="text-xs rounded px-3 py-2" style={{ color: 'var(--color-text-muted)', backgroundColor: 'rgba(0,0,0,0.03)', border: '1px solid var(--color-border)' }}>
                            Chiedi all'ospite di mostrare il documento alla telecamera. Sul chiosco compare una cornice guida.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} className="rounded px-4 py-1.5 text-xs"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>Annulla</button>
                            <button onClick={iniziaCattura} disabled={!prenotazioneId}
                                className="rounded px-4 py-1.5 text-xs font-medium"
                                style={{ backgroundColor: prenotazioneId ? 'var(--color-parlato)' : 'rgba(59,130,246,0.2)', color: '#fff', cursor: prenotazioneId ? 'pointer' : 'not-allowed' }}>
                                Inizia
                            </button>
                        </div>
                    </div>
                )}

                {/* CAPTURE */}
                {fase === 'capture' && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <span className="text-xs px-2 py-0.5 rounded font-mono uppercase"
                                  style={{ color: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.25)' }}>
                                {latoLabel}{fronteRetro ? (lato === 'fronte' ? ' (1/2)' : ' (2/2)') : ''}
                            </span>
                        </div>
                        <div className="relative rounded-lg overflow-hidden" style={{ aspectRatio: '4/3', backgroundColor: '#050710', border: '1px solid var(--color-border)' }}>
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-contain" />
                            {/* cornice guida documento */}
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div style={{ width: '78%', height: '64%', border: '2px dashed rgba(255,255,255,0.5)', borderRadius: 8 }} />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2">
                            <button onClick={onClose} className="rounded px-4 py-1.5 text-xs"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>Annulla</button>
                            <button onClick={cattura} className="rounded px-5 py-1.5 text-xs font-medium"
                                    style={{ backgroundColor: '#3b82f6', color: '#fff' }}>Cattura {lato}</button>
                        </div>
                    </div>
                )}

                {/* PREVIEW */}
                {fase === 'preview' && snapshotUrl && (
                    <div className="space-y-3">
                        <div className="rounded-lg overflow-hidden" style={{ aspectRatio: '4/3', backgroundColor: '#050710', border: '1px solid var(--color-border)' }}>
                            <img src={snapshotUrl} alt="Documento catturato" className="w-full h-full object-contain" />
                        </div>
                        <p className="text-xs text-center" style={{ color: 'var(--color-text-secondary)' }}>
                            Verifica il {lato}. Se è leggibile, salva.
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={riprendi} className="rounded px-4 py-1.5 text-xs"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>Riprendi</button>
                            <button onClick={salva} className="rounded px-5 py-1.5 text-xs font-medium"
                                    style={{ backgroundColor: '#22c55e', color: '#fff' }}>
                                {fronteRetro && lato === 'fronte' ? 'Salva fronte' : 'Salva'}
                            </button>
                        </div>
                    </div>
                )}

                {/* UPLOADING */}
                {fase === 'uploading' && (
                    <div className="flex flex-col items-center py-6 gap-3">
                        <div className="w-7 h-7 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: 'rgba(34,197,94,0.4)', borderTopColor: '#22c55e' }} />
                        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>Salvataggio…</p>
                    </div>
                )}

                {/* DONE */}
                {fase === 'done' && (
                    <div className="flex flex-col items-center py-6 gap-3">
                        <div className="rounded-full flex items-center justify-center" style={{ width: 56, height: 56, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)' }}>
                            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2"><polyline points="20 6 9 17 4 12"/></svg>
                        </div>
                        <p className="text-sm font-medium" style={{ color: '#22c55e' }}>Documento salvato</p>
                    </div>
                )}

                {/* ERROR */}
                {fase === 'error' && (
                    <div className="space-y-3">
                        <p className="text-xs rounded px-3 py-2" style={{ color: '#ef4444', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}>
                            {errore ?? 'Errore'}
                        </p>
                        <div className="flex justify-end gap-2">
                            <button onClick={() => { setErrore(null); setFase('capture'); }} className="rounded px-4 py-1.5 text-xs"
                                    style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>Riprova</button>
                            <button onClick={onClose} className="rounded px-4 py-1.5 text-xs" style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>Chiudi</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
