import { useEffect, useRef } from 'react';

/**
 * Invia POST /kiosk/heartbeat ogni `intervalMs` millisecondi (default 60s).
 *
 * I dati inviati sono rilevati al momento dell'invio (non al montaggio),
 * così fullscreen e screen size risultano sempre aggiornati.
 *
 * Non produce output visivo — eseguito in background, silenziosamente.
 * Gli errori di rete vengono ignorati: il TTL del heartbeat (120s) assicura
 * che un singolo fallimento non causi un falso offline.
 */
export function useKioskHeartbeat(intervalMs = 60_000): void {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        const send = async () => {
            try {
                const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]');
                const csrf = meta?.content ?? '';

                const payload = {
                    user_agent: navigator.userAgent,
                    fullscreen: Boolean(document.fullscreenElement),
                    screen_w:   window.screen.width,
                    screen_h:   window.screen.height,
                    url:        window.location.pathname,
                };

                await fetch('/kiosk/heartbeat', {
                    method:  'POST',
                    headers: {
                        'Content-Type':     'application/json',
                        'Accept':           'application/json',
                        'X-CSRF-TOKEN':     csrf,
                        'X-Requested-With': 'XMLHttpRequest',
                    },
                    body: JSON.stringify(payload),
                });
            } catch {
                // Errori di rete ignorati — il TTL gestisce la scadenza
            }
        };

        // Primo heartbeat immediato al montaggio
        send();

        timerRef.current = setInterval(send, intervalMs);

        return () => {
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
            }
        };
    }, [intervalMs]);
}
