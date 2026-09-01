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
/**
 * Stato media del chiosco riportato al server per la diagnostica remota
 * (Configurazioni → Chioschi → Diagnostica): permette di capire da lontano
 * perché un chiosco "non funziona" senza avere il suo browser sotto mano.
 */
export interface DiagnosticaMedia {
    sessione:          string | null;   // idle | connecting | connected | error
    sessione_tipo:     string | null;   // chiaro | nascosto | parlato
    gestita_da:        string | null;
    errore:            string | null;   // ultimo errore LiveKit (sessione)
    duplicato:         boolean;         // identità chiosco aperta altrove (sessione)
    presenza_online:   boolean;         // receptionist visibile
    presenza_connessa: boolean;         // stanza presenza collegata
    presenza_duplicato: boolean;
    presenza_errore:   string | null;
    audio_bloccato:    boolean;
}

export function useKioskHeartbeat(intervalMs = 60_000, media?: DiagnosticaMedia): void {
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const mediaRef = useRef<DiagnosticaMedia | undefined>(media);
    mediaRef.current = media;
    const sendRef = useRef<() => void>(() => {});

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
                    media:      mediaRef.current ?? null,
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

        sendRef.current = send;

        // Primo heartbeat immediato al montaggio
        send();

        timerRef.current = setInterval(send, intervalMs);

        return () => {
            if (timerRef.current !== null) {
                clearInterval(timerRef.current);
            }
        };
    }, [intervalMs]);

    // Heartbeat "di evento": quando cambia lo stato media (errore, duplicato,
    // connessione) lo si manda subito (debounce 1.5s), non si aspetta il minuto.
    const firma = media ? JSON.stringify(media) : '';
    useEffect(() => {
        if (!firma) return;
        const t = setTimeout(() => sendRef.current(), 1500);
        return () => clearTimeout(t);
    }, [firma]);
}
