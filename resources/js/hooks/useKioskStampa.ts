import { useEffect, useRef, useState } from 'react';
import { getStampaPendente, type StampaPendenteResult } from '@/services/kioskApi';

/**
 * Polling lato chiosco per richieste di stampa remota.
 *
 * Il receptionist innesca una richiesta via StampaController::store().
 * Il chiosco fa polling GET /kiosk/stampa-pendente ogni 5s.
 * Quando arriva una richiesta, il hook restituisce i metadati.
 * Il componente consumatore mostra StampaScreen e gestisce la stampa.
 */

const POLLING_MS = 5_000;

interface Result {
    stampa: StampaPendenteResult | null;
}

export function useKioskStampa(): Result {
    const [stampa, setStampa] = useState<StampaPendenteResult | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        let mounted = true;

        const poll = async () => {
            const result = await getStampaPendente();
            if (! mounted) return;
            setStampa(result);
        };

        // Prima lettura immediata
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

    return { stampa };
}
