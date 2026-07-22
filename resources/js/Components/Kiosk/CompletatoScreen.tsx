import type { AiUiState } from '@/hooks/useLiveKitChiosco';

// ── CompletatoScreen ─────────────────────────────────────────────────────────
// Riepilogo finale dopo la sessione AI: codice e camera restano leggibili
// (45s o finché l'ospite tocca Chiudi), senza sparire con la chiusura audio.

interface CompletatoScreenProps {
    dati:     AiUiState;
    scopo:    'checkin' | 'checkout' | 'info';
    onChiudi: () => void;
}

export default function CompletatoScreen({ dati, scopo, onChiudi }: CompletatoScreenProps) {
    const checkout = scopo === 'checkout';
    return (
        <div className="w-full h-full flex flex-col items-center justify-center px-8">
            <div className="rounded-full flex items-center justify-center mb-6"
                 style={{ width: 84, height: 84, backgroundColor: 'rgba(34,197,94,0.10)', border: '2px solid rgba(34,197,94,0.5)' }}>
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                </svg>
            </div>
            <h1 className="font-light mb-2" style={{ fontSize: 34, color: 'var(--color-text-primary)' }}>
                {checkout ? 'Check-out completato' : 'Check-in completato'}
            </h1>
            <p className="mb-8" style={{ color: 'var(--color-text-muted)' }}>
                {checkout ? 'Grazie del soggiorno — buon viaggio!' : 'Benvenuto — buon soggiorno!'}
            </p>

            <div className="flex items-stretch gap-4 mb-10 flex-wrap justify-center">
                {dati.codice && (
                    <div className="rounded-xl py-4 px-8 text-center"
                         style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.45)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>Codice prenotazione</p>
                        <p className="font-mono font-bold" style={{ fontSize: 32, letterSpacing: '0.12em', color: '#86efac' }}>{dati.codice}</p>
                    </div>
                )}
                {!checkout && dati.camera?.nome && (
                    <div className="rounded-xl py-4 px-8 text-center"
                         style={{ backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.4)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#93c5fd' }}>La tua camera</p>
                        <p className="font-bold" style={{ fontSize: 32, color: '#bfdbfe' }}>
                            {dati.camera.nome}
                            {dati.camera.piano !== null && dati.camera.piano !== undefined && (
                                <span className="font-normal" style={{ fontSize: 15, color: '#93c5fd' }}> · piano {dati.camera.piano}</span>
                            )}
                        </p>
                    </div>
                )}
                {checkout && dati.pagamento?.stato === 'ok' && dati.pagamento.importo !== undefined && (
                    <div className="rounded-xl py-4 px-8 text-center"
                         style={{ backgroundColor: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.45)' }}>
                        <p className="text-xs uppercase tracking-widest mb-1" style={{ color: '#4ade80' }}>Pagamento</p>
                        <p className="font-bold" style={{ fontSize: 32, color: '#86efac' }}>€ {Number(dati.pagamento.importo).toFixed(2)} ✓</p>
                    </div>
                )}
            </div>

            <button onClick={onChiudi}
                    className="rounded-xl px-8 py-3 text-sm transition-all active:scale-95"
                    style={{ color: 'var(--color-text-secondary)', border: '1px solid var(--color-border)' }}>
                Chiudi
            </button>
        </div>
    );
}
