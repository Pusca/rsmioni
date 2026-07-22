import { useEffect, useRef, useState } from 'react';
import { Chiosco } from '@/types';
import { getDocumentoPerStampa, segnalaStampaCompletata, annullaStampa } from '@/services/kioskApi';

// ── StampaScreen ─────────────────────────────────────────────────────────────
// Mostrata quando il receptionist ha richiesto la stampa di un documento.
// Il kiosk scarica il file, lo apre in un iframe nascosto e chiama window.print().
// Segnala l'esito (ok o errore) via POST /kiosk/stampe/completata.
//
// NOTA ARCHITETTURALE:
// window.print() mostra il dialog di stampa nativo del browser.
// Non è possibile verificare se l'utente ha effettivamente cliccato "Stampa" nel dialog.
// Il segnale "ok" = "dialog di stampa mostrato con successo".

interface StampaScreenProps {
    chiosco: Chiosco;
    titolo:  string | null;
}

type FaseStampa = 'download' | 'stampa' | 'completata' | 'errore';

export default function StampaScreen({ chiosco, titolo }: StampaScreenProps) {
    const [fase,   setFase]   = useState<FaseStampa>('download');
    const [errore, setErrore] = useState<string | null>(null);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        let blobUrl: string | null = null;
        let iframe: HTMLIFrameElement | null = null;

        const esegui = async () => {
            // 1. Scarica il documento dal server
            const blob = await getDocumentoPerStampa();
            if (! mountedRef.current) return;

            if (! blob) {
                setFase('errore');
                setErrore('Impossibile scaricare il documento dal server.');
                await segnalaStampaCompletata('errore', 'Download fallito');
                return;
            }

            blobUrl = URL.createObjectURL(blob);
            setFase('stampa');

            // 2. Carica in iframe nascosto e chiama print()
            iframe = document.createElement('iframe');
            iframe.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;opacity:0;';
            iframe.src = blobUrl;

            const onLoad = async () => {
                if (! mountedRef.current) return;
                try {
                    iframe!.contentWindow?.print();
                    // Il dialog è mostrato: segnala ok
                    // Aspetta brevemente per dare tempo al dialog di aprirsi
                    setTimeout(async () => {
                        if (! mountedRef.current) return;
                        if (blobUrl) URL.revokeObjectURL(blobUrl);
                        document.body.removeChild(iframe!);
                        await segnalaStampaCompletata('ok');
                        if (mountedRef.current) setFase('completata');
                    }, 800);
                } catch (err) {
                    if (blobUrl) URL.revokeObjectURL(blobUrl);
                    document.body.removeChild(iframe!);
                    const msg = 'Il browser non supporta la stampa automatica per questo tipo di file.';
                    await segnalaStampaCompletata('errore', msg);
                    if (mountedRef.current) { setFase('errore'); setErrore(msg); }
                }
            };

            const onError = async () => {
                if (blobUrl) URL.revokeObjectURL(blobUrl);
                if (iframe && document.body.contains(iframe)) document.body.removeChild(iframe);
                const msg = 'Impossibile caricare il documento nell\'iframe.';
                await segnalaStampaCompletata('errore', msg);
                if (mountedRef.current) { setFase('errore'); setErrore(msg); }
            };

            iframe.addEventListener('load', onLoad, { once: true });
            iframe.addEventListener('error', onError, { once: true });
            document.body.appendChild(iframe);
        };

        esegui();

        return () => {
            mountedRef.current = false;
            if (blobUrl) URL.revokeObjectURL(blobUrl);
            if (iframe && document.body.contains(iframe)) {
                try { document.body.removeChild(iframe); } catch { /* ignore */ }
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // Eseguito una sola volta al montaggio

    const handleAnnullaStampa = async () => {
        await annullaStampa();
        // La rimozione dello stato avverrà al prossimo poll
    };

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: fase === 'errore' ? '#ef4444' : fase === 'completata' ? '#22c55e' : '#7c3aed' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        {fase === 'download'  ? 'Download documento…'
                         : fase === 'stampa'  ? 'Stampa in corso'
                         : fase === 'completata' ? 'Stampa completata'
                         : 'Errore stampa'}
                    </span>
                    {titolo && (
                        <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono"
                            style={{ backgroundColor: 'rgba(124,58,237,0.12)', color: '#7c3aed', border: '1px solid rgba(124,58,237,0.25)' }}>
                            {titolo}
                        </span>
                    )}
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-6">

                {/* Download / stampa in corso */}
                {(fase === 'download' || fase === 'stampa') && (
                    <>
                        <div className="relative flex items-center justify-center" style={{ width: 96, height: 96 }}>
                            <div className="absolute inset-0 rounded-full animate-pulse"
                                style={{ backgroundColor: 'rgba(124,58,237,0.08)', border: '2px solid rgba(124,58,237,0.3)' }} />
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7c3aed" strokeWidth="1.5">
                                <polyline points="6 9 6 2 18 2 18 9"/>
                                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2"/>
                                <rect x="6" y="14" width="12" height="8"/>
                            </svg>
                        </div>
                        <div className="text-center">
                            <p className="text-xl font-light mb-2" style={{ color: 'var(--color-text-primary)' }}>
                                {fase === 'download' ? 'Preparazione documento…' : 'Stampa in corso…'}
                            </p>
                            <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                                {fase === 'download' ? 'Download in corso' : 'Il dialog di stampa si aprirà a breve'}
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                {fase === 'stampa' ? 'Printing document…' : 'Downloading…'}
                            </p>
                        </div>
                        {fase === 'stampa' && (
                            <button onClick={handleAnnullaStampa}
                                className="rounded-xl px-6 py-2 text-sm"
                                style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                Annulla
                            </button>
                        )}
                    </>
                )}

                {/* Completata */}
                {fase === 'completata' && (
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 80, height: 80, backgroundColor: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.4)' }}>
                            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <p className="text-xl font-light" style={{ color: '#22c55e' }}>Stampa completata</p>
                        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            Print completed
                        </p>
                    </div>
                )}

                {/* Errore */}
                {fase === 'errore' && (
                    <div className="flex flex-col items-center gap-4 text-center max-w-sm px-6">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 72, height: 72, backgroundColor: 'rgba(239,68,68,0.08)', border: '2px solid rgba(239,68,68,0.3)' }}>
                            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-lg font-light" style={{ color: '#ef4444' }}>Errore stampa</p>
                            {errore && (
                                <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>{errore}</p>
                            )}
                        </div>
                    </div>
                )}

                {import.meta.env.DEV && (
                    <div className="absolute bottom-3 left-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {chiosco.nome} · stampa · {fase}
                    </div>
                )}
            </div>
        </div>
    );
}
