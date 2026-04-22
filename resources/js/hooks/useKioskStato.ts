import { useEffect, useRef, useState } from 'react';
import { getStatoChiosco } from '@/services/kioskApi';
import type { StatoChiosco } from '@/types';

/**
 * Monitora lo stato runtime del chiosco lato browser kiosk.
 *
 * Riceve aggiornamenti in due modi:
 *   1. Realtime via Reverb — canale chiosco.{chioscoId}, evento .chiosco.stato_cambiato
 *      (stesso canale usato da useWebRtcChiosco per le sessioni WebRTC)
 *   2. Polling HTTP — GET /kiosk/stato ogni 5s (fallback quando Reverb non disponibile)
 *
 * NOTA: non chiama Echo.leave() in cleanup perché il canale chiosco.{chioscoId}
 * è co-gestito da useWebRtcChiosco. La pagina kiosk non dismonta mai, quindi
 * la concorrenza non è un problema pratico.
 */

interface EchoChannel {
    listen(event: string, callback: (data: unknown) => void): this;
    error(callback: (error: unknown) => void): this;
}

interface StatoCambiatoPayload {
    chiosco_id:   string;
    stato:        string;
    messaggio:    string | null;
}

interface Options {
    chioscoId:        string | null;
    statoIniziale:    StatoChiosco;
    messaggioIniziale: string | null;
}

interface Result {
    stato:          StatoChiosco;
    messaggioAttesa: string | null;
}

const POLLING_MS = 5_000;

export function useKioskStato({ chioscoId, statoIniziale, messaggioIniziale }: Options): Result {
    const [stato,           setStato]           = useState<StatoChiosco>(statoIniziale);
    const [messaggioAttesa, setMessaggioAttesa] = useState<string | null>(messaggioIniziale);
    const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        if (! chioscoId) return;

        let mounted = true;

        const applicaAggiornamento = (nuovo: string, messaggio: string | null) => {
            if (! mounted) return;
            setStato(nuovo as StatoChiosco);
            if (nuovo === 'messaggio_attesa') {
                setMessaggioAttesa(messaggio);
            } else if (nuovo === 'idle' || nuovo === 'offline') {
                setMessaggioAttesa(null);
            }
            // Per altri stati (in_chiamata, in_chiaro, ecc.) non tocchiamo il messaggio
        };

        // ── Polling fallback ────────────────────────────────────────────────
        const avviaPolling = () => {
            if (pollingRef.current) return; // già attivo
            pollingRef.current = setInterval(async () => {
                const result = await getStatoChiosco();
                if (result) applicaAggiornamento(result.stato, result.messaggio_attesa);
            }, POLLING_MS);
        };

        // ── Echo realtime ───────────────────────────────────────────────────
        if (typeof window !== 'undefined' && window.Echo) {
            try {
                const ch = window.Echo.private(`chiosco.${chioscoId}`) as unknown as EchoChannel;

                ch.listen('.chiosco.stato_cambiato', (raw: unknown) => {
                    const data = raw as StatoCambiatoPayload;
                    if (data.chiosco_id !== chioscoId) return;
                    applicaAggiornamento(data.stato, data.messaggio ?? null);
                });

                ch.error(() => {
                    // Reverb non disponibile — attiva polling
                    avviaPolling();
                });
            } catch {
                avviaPolling();
            }
        } else {
            avviaPolling();
        }

        // Recovery iniziale: richiesta HTTP in caso di stato non aggiornato
        getStatoChiosco().then(result => {
            if (result && mounted) {
                applicaAggiornamento(result.stato, result.messaggio_attesa);
            }
        });

        return () => {
            mounted = false;
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            // NON chiamiamo Echo.leave() — useWebRtcChiosco gestisce il canale
        };
    }, [chioscoId]);

    return { stato, messaggioAttesa };
}
