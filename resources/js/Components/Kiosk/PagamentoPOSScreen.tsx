import { useState } from 'react';
import { Chiosco } from '@/types';
import { segnalaEsitoPagamento, annullaPagamento } from '@/services/kioskApi';

// ── PagamentoPOSScreen ────────────────────────────────────────────────────────
// Mostrata quando il receptionist ha richiesto un pagamento POS.
//
// NOTA ARCHITETTURALE (adapter mock onesto):
// L'integrazione hardware POS reale (Ingenico/MyPOS) richiede un layer nativo
// (Electron, app locale o middleware) che legga/scriva i file path_input_pos /
// path_output_pos. Dal browser non è possibile accedere al filesystem del kiosk.
//
// Questa schermata presenta importo e causale, e fornisce pulsanti manuali per
// simulare l'esito. In un'integrazione completa, il layer nativo leggerebbe il
// file di risposta POS e chiamerebbe segnalaEsitoPagamento() automaticamente.

interface PagamentoPOSScreenProps {
    chiosco:  Chiosco;
    importo:  number;
    valuta:   string;
    causale:  string | null;
    tipoPOS:  string;
}

type FasePagamento = 'attesa' | 'elaborazione' | 'ok' | 'ko' | 'annullato';

export default function PagamentoPOSScreen({ chiosco, importo, valuta, causale, tipoPOS }: PagamentoPOSScreenProps) {
    const [fase,       setFase]       = useState<FasePagamento>('attesa');
    const [elaborando, setElaborando] = useState(false);

    const handleEsito = async (esito: 'ok' | 'ko' | 'annullato') => {
        if (elaborando) return;
        setElaborando(true);
        setFase('elaborazione');

        const result = await segnalaEsitoPagamento(
            esito,
            esito === 'ok' ? importo : undefined,
        );

        if (result.ok) {
            setFase(esito);
        } else {
            // In caso di errore di rete: continua a mostrare la schermata
            // — il polling del chiosco riprenderà al prossimo ciclo.
            setFase('attesa');
        }
        setElaborando(false);
    };

    const handleAnnullaGuest = async () => {
        if (elaborando) return;
        setElaborando(true);
        await annullaPagamento();
        setFase('annullato');
        setElaborando(false);
    };

    const simboloValuta = valuta === 'EUR' ? '€' : valuta;

    return (
        <div className="w-full h-full flex flex-col" style={{ backgroundColor: '#050710' }}>
            {/* Status bar */}
            <div className="shrink-0 flex items-center justify-between px-4 py-2"
                style={{ backgroundColor: 'var(--color-bg-primary)', borderBottom: '1px solid var(--color-border)' }}>
                <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: fase === 'ok' ? '#22c55e' : fase === 'ko' ? '#ef4444' : '#10b981' }} />
                    <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>
                        Pagamento POS
                    </span>
                    <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-mono uppercase"
                        style={{ backgroundColor: 'rgba(16,185,129,0.12)', color: '#10b981', border: '1px solid rgba(16,185,129,0.25)' }}>
                        {tipoPOS}
                    </span>
                </div>
                <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>{chiosco.nome}</span>
            </div>

            {/* Corpo */}
            <div className="flex-1 flex flex-col items-center justify-center gap-8 px-6">

                {/* ── In attesa / elaborazione ── */}
                {(fase === 'attesa' || fase === 'elaborazione') && (
                    <>
                        {/* Importo */}
                        <div className="flex flex-col items-center gap-3">
                            <div className="rounded-2xl px-10 py-6 text-center"
                                style={{ backgroundColor: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                                <p className="text-sm mb-1" style={{ color: 'var(--color-text-muted)' }}>
                                    Importo da pagare
                                </p>
                                <p className="text-5xl font-light" style={{ color: '#10b981', letterSpacing: '-0.02em' }}>
                                    {simboloValuta} {importo.toFixed(2)}
                                </p>
                                {causale && (
                                    <p className="text-base mt-3" style={{ color: 'var(--color-text-secondary)' }}>
                                        {causale}
                                    </p>
                                )}
                            </div>
                        </div>

                        {/* Istruzione POS */}
                        <div className="text-center space-y-2">
                            <div className="flex items-center justify-center mb-4">
                                <div className="rounded-2xl flex items-center justify-center"
                                    style={{ width: 80, height: 80, backgroundColor: 'rgba(16,185,129,0.08)', border: '2px solid rgba(16,185,129,0.3)' }}>
                                    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="1.2">
                                        <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                                        <line x1="1" y1="10" x2="23" y2="10"/>
                                    </svg>
                                </div>
                            </div>
                            <p className="text-xl font-light" style={{ color: 'var(--color-text-primary)' }}>
                                Avvicinare la carta al POS
                            </p>
                            <p className="text-base" style={{ color: 'var(--color-text-secondary)' }}>
                                Tap or insert your card on the POS terminal
                            </p>
                        </div>

                        {/* Mock POS — pulsanti manuali (DEV o sempre in assenza di HW) */}
                        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
                            <p className="text-xs font-mono uppercase tracking-widest mb-1"
                                style={{ color: 'rgba(255,255,255,0.2)' }}>
                                {import.meta.env.DEV ? '[DEV] Simula esito POS' : 'Seleziona esito'}
                            </p>
                            <div className="flex items-center gap-4 w-full">
                                <button
                                    onClick={() => handleEsito('ok')}
                                    disabled={elaborando}
                                    className="flex-1 rounded-xl py-3 text-sm font-medium transition-all active:scale-95"
                                    style={{
                                        backgroundColor: elaborando ? 'rgba(34,197,94,0.04)' : 'rgba(34,197,94,0.1)',
                                        border:          '1px solid rgba(34,197,94,0.4)',
                                        color:           '#22c55e',
                                        cursor:          elaborando ? 'default' : 'pointer',
                                    }}>
                                    Pagamento riuscito
                                </button>
                                <button
                                    onClick={() => handleEsito('ko')}
                                    disabled={elaborando}
                                    className="flex-1 rounded-xl py-3 text-sm font-medium transition-all active:scale-95"
                                    style={{
                                        backgroundColor: elaborando ? 'rgba(239,68,68,0.04)' : 'rgba(239,68,68,0.08)',
                                        border:          '1px solid rgba(239,68,68,0.3)',
                                        color:           '#ef4444',
                                        cursor:          elaborando ? 'default' : 'pointer',
                                    }}>
                                    Rifiutato
                                </button>
                            </div>
                            <button
                                onClick={handleAnnullaGuest}
                                disabled={elaborando}
                                className="rounded-xl px-6 py-2 text-sm"
                                style={{
                                    color:           'var(--color-text-muted)',
                                    border:          '1px solid var(--color-border)',
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    cursor:          elaborando ? 'default' : 'pointer',
                                }}>
                                Annulla
                            </button>
                        </div>

                        {/* Spinner elaborazione */}
                        {fase === 'elaborazione' && (
                            <div className="flex items-center gap-3">
                                <div className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                                    style={{ borderColor: 'rgba(16,185,129,0.3)', borderTopColor: '#10b981' }} />
                                <span className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                                    Comunicazione con il server…
                                </span>
                            </div>
                        )}
                    </>
                )}

                {/* ── Esito OK ── */}
                {fase === 'ok' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(34,197,94,0.1)', border: '3px solid rgba(34,197,94,0.4)' }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2">
                                <polyline points="20 6 9 17 4 12"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-3xl font-light" style={{ color: '#22c55e' }}>
                                {simboloValuta} {importo.toFixed(2)}
                            </p>
                            <p className="text-xl font-light mt-2" style={{ color: 'var(--color-text-primary)' }}>
                                Pagamento completato
                            </p>
                            <p className="text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Payment successful
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Esito KO ── */}
                {fase === 'ko' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(239,68,68,0.08)', border: '3px solid rgba(239,68,68,0.35)' }}>
                            <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="12" y1="8" x2="12" y2="12"/>
                                <line x1="12" y1="16" x2="12.01" y2="16"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xl font-light" style={{ color: '#ef4444' }}>
                                Pagamento non riuscito
                            </p>
                            <p className="text-base mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Carta rifiutata o operazione non completata
                            </p>
                            <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                                Payment declined
                            </p>
                        </div>
                    </div>
                )}

                {/* ── Annullato ── */}
                {fase === 'annullato' && (
                    <div className="flex flex-col items-center gap-6 text-center">
                        <div className="rounded-full flex items-center justify-center"
                            style={{ width: 96, height: 96, backgroundColor: 'rgba(92,99,128,0.08)', border: '2px solid var(--color-border)' }}>
                            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10"/>
                                <line x1="15" y1="9" x2="9" y2="15"/>
                                <line x1="9" y1="9" x2="15" y2="15"/>
                            </svg>
                        </div>
                        <div>
                            <p className="text-xl font-light" style={{ color: 'var(--color-text-muted)' }}>
                                Operazione annullata
                            </p>
                            <p className="text-sm mt-1" style={{ color: '#3a3f55' }}>
                                Payment cancelled
                            </p>
                        </div>
                    </div>
                )}

                {import.meta.env.DEV && (
                    <div className="absolute bottom-3 left-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {chiosco.nome} · pagamento_pos · {fase}
                    </div>
                )}
            </div>
        </div>
    );
}
