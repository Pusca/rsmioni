import { useCallback, useEffect, useRef, useState } from 'react';
import { Chiosco } from '@/types';
import { uploadDocumentoAcquisito } from '@/services/kioskApi';

// ── AcquisizioneScreen ───────────────────────────────────────────────────────
// Mostrata quando il receptionist ha inviato una richiesta di acquisizione.
// Il guest inquadra il documento, cattura l'immagine tramite webcam e la invia.

interface AcquisizioneScreenProps {
    chiosco:       Chiosco;
    titolo:        string | null;
    fronteRetro:   boolean;
    onCompletata:  () => void;
    onAnnulla:     () => void;
    /** Webcam già pubblicata nella sessione video attiva: su mobile la camera
     *  è esclusiva, un secondo getUserMedia fallisce o restituisce nero. */
    trackCondiviso?: MediaStreamTrack | null;
}

type FaseAcquisizione = 'preview' | 'uploading' | 'completata' | 'errore';
type LatoAcquisizione = 'fronte' | 'retro';

export default function AcquisizioneScreen({ chiosco, titolo, fronteRetro, onCompletata, onAnnulla, trackCondiviso }: AcquisizioneScreenProps) {
    const videoRef   = useRef<HTMLVideoElement>(null);
    const canvasRef  = useRef<HTMLCanvasElement>(null);
    const streamRef  = useRef<MediaStream | null>(null);
    const mountedRef = useRef(true);

    const [fase,    setFase]    = useState<FaseAcquisizione>('preview');
    const [errore,  setErrore]  = useState<string | null>(null);
    const [snapshot, setSnapshot] = useState<string | null>(null);
    const [lato,    setLato]    = useState<LatoAcquisizione>(fronteRetro ? 'fronte' : 'fronte');

    // Avvio webcam. Se la camera è già impegnata dalla sessione video (mobile:
    // accesso esclusivo → secondo getUserMedia nero o NotReadableError), riusa
    // la track già pubblicata su LiveKit invece di aprirne una nuova.
    const borrowedRef = useRef(false);

    useEffect(() => {
        mountedRef.current = true;
        let stream: MediaStream | null = null;

        const usaStream = (s: MediaStream, borrowed: boolean) => {
            borrowedRef.current = borrowed;
            stream = s;
            streamRef.current = s;
            if (videoRef.current) {
                videoRef.current.srcObject = s;
                videoRef.current.play().catch(() => {});
            }
        };

        const fallbackTrackCondivisa = (): boolean => {
            if (trackCondiviso && trackCondiviso.readyState === 'live') {
                // Track presa in prestito dalla chiamata: NON va mai stoppata qui
                usaStream(new MediaStream([trackCondiviso]), true);
                return true;
            }
            return false;
        };

        // Con una sessione video attiva parte direttamente dalla track condivisa:
        // su mobile il getUserMedia concorrente fallirebbe comunque.
        if (trackCondiviso && trackCondiviso.readyState === 'live') {
            fallbackTrackCondivisa();
        } else {
            navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
                .then(s => {
                    if (! mountedRef.current) { s.getTracks().forEach(t => t.stop()); return; }
                    usaStream(s, false);
                })
                .catch(() => {
                    if (! mountedRef.current) return;
                    if (fallbackTrackCondivisa()) return;
                    setFase('errore');
                    setErrore('Impossibile accedere alla webcam. Verificare le autorizzazioni del browser.');
                });
        }

        return () => {
            mountedRef.current = false;
            if (borrowedRef.current) return; // track della chiamata: resta viva
            if (stream) stream.getTracks().forEach(t => t.stop());
            else if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Cattura frame dalla webcam
    const handleCattura = useCallback(() => {
        const video  = videoRef.current;
        const canvas = canvasRef.current;
        if (! video || ! canvas) return;

        canvas.width  = video.videoWidth  || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        if (! ctx) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
        setSnapshot(dataUrl);
    }, []);

    // Conferma e upload
    const handleInvia = useCallback(async () => {
        const canvas = canvasRef.current;
        if (! canvas) return;

        setFase('uploading');
        canvas.toBlob(async (blob) => {
            if (! blob) { setFase('errore'); setErrore('Errore nella creazione dell\'immagine.'); return; }

            const isLastStep = !fronteRetro || lato === 'retro';
            const result = await uploadDocumentoAcquisito(blob, fronteRetro ? {
                lato,
                parziale: lato === 'fronte',
            } : undefined);

            if (! mountedRef.current) return;
            if (result.ok) {
                if (isLastStep) {
                    setFase('completata');
                    streamRef.current?.getTracks().forEach(t => t.stop());
                    setTimeout(() => { if (mountedRef.current) onCompletata(); }, 2_000);
                } else {
                    // Fronte inviato, passa al retro
                    setLato('retro');
                    setSnapshot(null);
                    setFase('preview');
                }
            } else {
                setFase('errore');
                setErrore(result.errore ?? 'Errore upload');
            }
        }, 'image/jpeg', 0.92);
    }, [onCompletata, fronteRetro, lato]);

    const handleRiprendi = () => {
        setSnapshot(null);
        setFase('preview');
        setErrore(null);
    };

    const handleAnnullaGuest = async () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        await onAnnulla();
    };

    const latoLabel    = fronteRetro ? (lato === 'fronte' ? 'FRONTE' : 'RETRO') : null;
    const stepLabel    = fronteRetro ? (lato === 'fronte' ? '1/2' : '2/2') : null;
    const confirmLabel = fronteRetro && lato === 'fronte' ? 'Conferma fronte' : 'Invia documento';

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Acquisizione documento
                    </span>
                    {titolo && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono"
                            style={{ backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' }}>
                            {titolo}
                        </span>
                    )}
                    {latoLabel && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono uppercase"
                            style={{ backgroundColor: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.25)' }}>
                            {latoLabel} ({stepLabel})
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6">

                {/* Preview / snapshot */}
                {(fase === 'preview' || fase === 'uploading') && (
                    <div className="relative rounded-2xl overflow-hidden shadow-2xl"
                        style={{ width: '480px', maxWidth: '90vw', aspectRatio: '4/3',
                                 backgroundColor: 'var(--color-bg-primary)', border: '2px solid rgba(59,130,246,0.3)' }}>
                        {/* Video live */}
                        <video ref={videoRef} autoPlay playsInline muted
                            className="w-full h-full object-cover"
                            style={{ display: snapshot ? 'none' : 'block' }} />
                        {/* Snapshot catturato */}
                        {snapshot && (
                            <img src={snapshot} alt="Documento catturato"
                                className="w-full h-full object-contain" />
                        )}
                        {/* Canvas nascosto per cattura */}
                        <canvas ref={canvasRef} style={{ display: 'none' }} />
                        {/* Indicatore live */}
                        {! snapshot && (
                            <div className="absolute top-3 right-3 flex items-center gap-1.5 rounded-full px-2.5 py-1"
                                style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
                                <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: '#ef4444' }} />
                                <span className="text-xs" style={{ color: '#fff', fontSize: '10px' }}>LIVE</span>
                            </div>
                        )}
                    </div>
                )}

                {/* Completata */}
                {fase === 'completata' && (
                    <div className="flex flex-col items-center gap-4">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 80, height: 80, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <p className="text-xl font-light" style={{ color: '#22c55e' }}>
                            {fronteRetro ? 'Documento acquisito (fronte e retro)' : 'Documento acquisito'}
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Document acquired successfully
                        </p>
                    </div>
                )}

                {/* Errore */}
                {fase === 'errore' && (
                    <div className="flex flex-col items-center gap-4 max-w-sm text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 72, height: 72, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-light" style={{ color: '#ef4444' }}>Errore</p>
                            {errore && (
                                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{errore}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Istruzioni e controlli */}
                {fase === 'preview' && ! snapshot && (
                    <div className="text-center space-y-2">
                        <p className="text-base font-light" style={{ color: 'var(--color-text-primary)' }}>
                            {fronteRetro
                                ? (lato === 'fronte'
                                    ? <>Inquadrare il <strong>fronte</strong> del documento e premere <strong>Cattura</strong></>
                                    : <>Inquadrare il <strong>retro</strong> del documento e premere <strong>Cattura</strong></>)
                                : <>Inquadrare il documento e premere <strong>Cattura</strong></>
                            }
                        </p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            {fronteRetro
                                ? (lato === 'fronte'
                                    ? <>Frame the <strong>front</strong> of your document and tap <strong>Capture</strong></>
                                    : <>Frame the <strong>back</strong> of your document and tap <strong>Capture</strong></>)
                                : <>Frame your document and tap <strong>Capture</strong></>
                            }
                        </p>
                    </div>
                )}
                {fase === 'preview' && snapshot && (
                    <p className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>
                        Verificare l'immagine. Se corretta, premere <strong>{fronteRetro && lato === 'fronte' ? 'Conferma fronte' : 'Invia'}</strong>.
                    </p>
                )}

                {/* Pulsanti azione */}
                <div className="flex items-center gap-4">
                    {fase === 'preview' && ! snapshot && (
                        <>
                            <button onClick={handleAnnullaGuest}
                                className="rounded-xl px-6 py-3 text-sm"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                Annulla
                            </button>
                            <button onClick={handleCattura}
                                className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                                style={{ backgroundColor: '#3b82f6', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                Cattura
                            </button>
                        </>
                    )}
                    {fase === 'preview' && snapshot && (
                        <>
                            <button onClick={handleRiprendi}
                                className="rounded-xl px-6 py-3 text-sm"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                Riprendi
                            </button>
                            <button onClick={handleInvia}
                                className="rounded-xl px-8 py-3 text-sm font-medium transition-all active:scale-95"
                                style={{ backgroundColor: '#22c55e', color: '#fff', border: 'none', cursor: 'pointer' }}>
                                {confirmLabel}
                            </button>
                        </>
                    )}
                    {fase === 'uploading' && (
                        <div className="flex items-center gap-3">
                            <div className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
                                style={{ borderColor: 'rgba(34,197,94,0.4)', borderTopColor: '#22c55e' }} />
                            <span className="text-sm" style={{ color: 'var(--color-text-secondary)' }}>Caricamento…</span>
                        </div>
                    )}
                    {fase === 'errore' && (
                        <button onClick={handleAnnullaGuest}
                            className="rounded-xl px-6 py-3 text-sm"
                            style={{ color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                            Chiudi
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
