import { useEffect, useRef, useState } from 'react';
import { getPagamentoPendente, type PagamentoPendenteResult } from '@/services/kioskApi';

/**
 * Polling lato chiosco per richieste di pagamento POS remoto.
 *
 * Il receptionist/gestore innesca una richiesta via PagamentoPOSController::store().
 * Il chiosco fa polling GET /kiosk/pagamento-pendente ogni 3s.
 * Quando arriva una richiesta pendente, il hook restituisce i dati del pagamento.
 * Il componente consumatore mostra la schermata POS.
 */

const POLLING_MS = 3_000;

interface Result {
    pagamento: PagamentoPendenteResult | null;
}

export function useKioskPagamento(): Result {
    const [pagamento, setPagamento] = useState<PagamentoPendenteResult | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        let mounted = true;

        const poll = async () => {
            const result = await getPagamentoPendente();
            if (! mounted) return;
            setPagamento(result);
        };

        poll();

        intervalRef.current = setInterval(poll, POLLING_MS);

        return () => {
            mounted = false;
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
                intervalRef.current = null;
            }
        };
    }, []);

    return { pagamento };
}
