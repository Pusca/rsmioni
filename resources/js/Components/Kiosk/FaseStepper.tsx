/**
 * Stepper di fase del processo (dalla FSM dell'agent): mostra all'ospite
 * a che punto è il check-in/out. Discreto, sotto il titolo del recap.
 */
export default function FaseStepper({ fase, scopo }: { fase: string | null; scopo: 'checkin' | 'checkout' | 'info' }) {
    const passi: { chiavi: string[]; label: string }[] = scopo === 'checkout'
        ? [
            { chiavi: ['ricerca'],   label: 'Ricerca' },
            { chiavi: ['trovata'],   label: 'Prenotazione' },
            { chiavi: ['pagamento'], label: 'Pagamento' },
            { chiavi: ['congedo'],   label: 'Fine' },
        ]
        : [
            { chiavi: ['accoglienza', 'dati'], label: 'Dati' },
            { chiavi: ['conferma'],            label: 'Conferma' },
            { chiavi: ['salvata', 'camera'],   label: 'Camera' },
            { chiavi: ['documento'],           label: 'Documento' },
            { chiavi: ['congedo'],             label: 'Fine' },
        ];
    const idxCorrente = Math.max(0, passi.findIndex((p) => p.chiavi.includes(fase ?? '')));

    return (
        <div className="flex items-center gap-1.5 mb-4">
            {passi.map((p, i) => {
                const fatto    = i < idxCorrente;
                const corrente = i === idxCorrente;
                return (
                    <div key={p.label} className="flex items-center gap-1.5 flex-1">
                        <div className="flex flex-col items-center gap-1 flex-1">
                            <div className="w-full rounded-full transition-all duration-500"
                                 style={{ height: 4,
                                          backgroundColor: fatto ? '#22c55e' : corrente ? '#3b82f6' : 'rgba(148,163,184,0.2)' }} />
                            <span className="text-[10px] uppercase tracking-wide transition-colors duration-500"
                                  style={{ color: fatto ? '#4ade80' : corrente ? '#93c5fd' : 'rgba(148,163,184,0.4)',
                                           fontWeight: corrente ? 700 : 400 }}>
                                {p.label}
                            </span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
