import { useEffect, useRef, useState } from 'react';
import { StatoChiosco } from '@/types';

export interface StatoAggiornato {
    chiosco_id:   string;
    chiosco_nome: string;
    stato:        StatoChiosco;
    messaggio:    string | null;
}

// Tipo minimo per i canali Echo che usiamo — evita dipendenza dal tipo
// generico di Echo<'reverb'> che non espone i metodi in modo diretto.
interface EchoChannel {
    listen(event: string, callback: (data: StatoAggiornato) => void): this;
    subscribed(callback: () => void): this;
    error(callback: (error: unknown) => void): this;
}

interface Options {
    hotelIds:        string[];
    onStatoCambiato: (update: StatoAggiornato) => void;
}

/**
 * Sottoscrive i canali Reverb `portineria.{hotelId}` per ogni hotel dell'utente.
 * Se Echo non è disponibile o la connessione fallisce, segnala realtimeAttivo=false
 * così il chiamante può attivare il polling fallback.
 */
export function usePortineriaRealtime({ hotelIds, onStatoCambiato }: Options): {
    realtimeAttivo: boolean;
} {
    const [realtimeAttivo, setRealtimeAttivo] = useState(false);
    const callbackRef = useRef(onStatoCambiato);
    callbackRef.current = onStatoCambiato;

    useEffect(() => {
        if (typeof window === 'undefined' || !window.Echo || hotelIds.length === 0) {
            setRealtimeAttivo(false);
            return;
        }

        const channels: EchoChannel[] = [];

        for (const hotelId of hotelIds) {
            try {
                const ch = window.Echo.private(`portineria.${hotelId}`) as unknown as EchoChannel;

                ch.listen('.chiosco.stato_cambiato', (e: StatoAggiornato) => {
                    callbackRef.current(e);
                });

                ch.subscribed(() => {
                    setRealtimeAttivo(true);
                });

                ch.error(() => {
                    setRealtimeAttivo(false);
                });

                channels.push(ch);
            } catch {
                setRealtimeAttivo(false);
            }
        }

        return () => {
            for (const hotelId of hotelIds) {
                try {
                    window.Echo?.leave(`portineria.${hotelId}`);
                } catch { /* ignore */ }
            }
            setRealtimeAttivo(false);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hotelIds.join(',')]);

    return { realtimeAttivo };
}

/**
 * Polling fallback: interroga il backend ogni N secondi per aggiornare
 * lo stato dei chioschi quando Reverb non è disponibile.
 */
export function usePortineriaPolling(
    chioscoIds: string[],
    onStatoCambiato: (update: StatoAggiornato) => void,
    intervalMs = 5000,
): void {
    const callbackRef = useRef(onStatoCambiato);
    callbackRef.current = onStatoCambiato;

    useEffect(() => {
        if (chioscoIds.length === 0) return;

        const poll = async () => {
            for (const id of chioscoIds) {
                try {
                    const res = await fetch(`/portineria/chioschi/${id}/stato`, {
                        headers: { Accept: 'application/json' },
                    });
                    if (res.ok) {
                        const data = (await res.json()) as {
                            chiosco_id: string;
                            stato:      string;
                            messaggio:  string | null;
                        };
                        callbackRef.current({
                            chiosco_id:   data.chiosco_id,
                            chiosco_nome: '',
                            stato:        data.stato as StatoChiosco,
                            messaggio:    data.messaggio ?? null,
                        });
                    }
                } catch { /* network error, skip */ }
            }
        };

        const timer = setInterval(poll, intervalMs);
        return () => clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chioscoIds.join(','), intervalMs]);
}
