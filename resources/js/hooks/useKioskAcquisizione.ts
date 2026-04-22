import { useEffect, useRef, useState } from 'react';
import { getAcquisizionePendente, type AcquisizionePendenteResult } from '@/services/kioskApi';

/**
 * Polling lato chiosco per richieste di acquisizione documento.
 *
 * Il receptionist innesca una richiesta via AcquisizioneDocumentoController::store().
 * Il chiosco fa polling GET /kiosk/acquisizione-pendente ogni 5s.
 * Quando arriva una richiesta pendente, il hook restituisce i metadati.
 * Il componente consumatore mostra la schermata di acquisizione webcam.
 */

const POLLING_MS = 5_000;

interface Result {
    acquisizione: AcquisizionePendenteResult | null;
}

export function useKioskAcquisizione(): Result {
    const [acquisizione, setAcquisizione] = useState<AcquisizionePendenteResult | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        let mounted = true;

        const poll = async () => {
            const result = await getAcquisizionePendente();
            if (! mounted) return;
            setAcquisizione(result);
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

    return { acquisizione };
}
