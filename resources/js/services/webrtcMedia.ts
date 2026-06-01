/**
 * Classificazione errori getUserMedia e WebRTC connection.
 * Usato da useWebRtcParlato e useWebRtcChiosco per mostrare messaggi precisi.
 *
 * DOMException.name possibili da getUserMedia:
 *   NotAllowedError / PermissionDeniedError → utente ha negato i permessi
 *   NotReadableError / TrackStartError      → device occupato da altra app/tab
 *   NotFoundError / DevicesNotFoundError    → hardware non trovato
 *   SecurityError                           → non HTTPS e non localhost
 *   OverconstrainedError                    → vincoli non soddisfacibili
 *   AbortError                              → operazione interrotta
 */

export type TipoErroreMedia =
    | 'permessi_negati'
    | 'device_occupato'
    | 'device_non_trovato'
    | 'contesto_non_sicuro'
    | 'condivisione_negata'
    | 'peer_irraggiungibile'
    | 'connessione_interrotta'
    | 'timeout_signaling'
    | 'sconosciuto';

export interface ErroreMedia {
    tipo:        TipoErroreMedia;
    messaggio:   string;
    suggerimento: string;
}

export function classificaErroreMedia(err: unknown): ErroreMedia {
    if (err instanceof DOMException) {
        switch (err.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                return {
                    tipo: 'permessi_negati',
                    messaggio: 'Accesso a webcam/microfono negato.',
                    suggerimento:
                        'Clicca sull\'icona del lucchetto nella barra degli indirizzi, ' +
                        'consenti webcam e microfono, poi ricarica la pagina.',
                };
            case 'NotReadableError':
            case 'TrackStartError':
                return {
                    tipo: 'device_occupato',
                    messaggio: 'Webcam o microfono già in uso da un\'altra applicazione.',
                    suggerimento:
                        'Chiudi altri programmi o schede browser che usano la webcam ' +
                        '(Zoom, Teams, Meet, altri tab). ' +
                        'Su stesso PC con due browser: solo un tab alla volta può usare la webcam.',
                };
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return {
                    tipo: 'device_non_trovato',
                    messaggio: 'Nessuna webcam o microfono trovato.',
                    suggerimento:
                        'Collega i dispositivi audio/video e ricarica la pagina.',
                };
            case 'SecurityError':
                return {
                    tipo: 'contesto_non_sicuro',
                    messaggio: 'Contesto non sicuro — webcam non accessibile.',
                    suggerimento:
                        'WebRTC richiede HTTPS o localhost. ' +
                        'Verifica che l\'URL sia http://localhost (non un IP di rete).',
                };
            default:
                return {
                    tipo: 'sconosciuto',
                    messaggio: `Errore dispositivo: ${err.name}`,
                    suggerimento: err.message || 'Dettaglio non disponibile.',
                };
        }
    }
    return {
        tipo: 'sconosciuto',
        messaggio: 'Impossibile accedere ai dispositivi media.',
        suggerimento: String(err),
    };
}

export function messaggioPeerFallito(stato: RTCPeerConnectionState): ErroreMedia {
    if (stato === 'failed') {
        return {
            tipo: 'peer_irraggiungibile',
            messaggio: 'Connessione P2P fallita.',
            suggerimento:
                'I due peer non riescono a raggiungersi via ICE/STUN. ' +
                'Su reti aziendali o con NAT simmetrico serve un TURN server. ' +
                'Su stesso PC: usa due browser diversi (Chrome + Firefox).',
        };
    }
    return {
        tipo: 'connessione_interrotta',
        messaggio: 'Connessione WebRTC interrotta.',
        suggerimento:
            'Il peer si è disconnesso. Chiudi il parlato e riprova.',
    };
}

/**
 * Classifica gli errori di getDisplayMedia (condivisione schermo).
 *
 * DOMException.name possibili da getDisplayMedia:
 *   NotAllowedError / PermissionDeniedError → utente ha annullato o browser/OS nega
 *   NotFoundError / DevicesNotFoundError    → nessuna sorgente schermo disponibile
 *   NotReadableError                        → schermo già acquisito da altra app
 *   AbortError                              → operazione interrotta (es. cambio focus)
 *   InvalidStateError                       → contesto non idoneo (background tab raro)
 */
export function classificaErroreCondivisione(err: unknown): ErroreMedia {
    if (err instanceof DOMException) {
        switch (err.name) {
            case 'NotAllowedError':
            case 'PermissionDeniedError':
                return {
                    tipo: 'condivisione_negata',
                    messaggio: 'Condivisione schermo negata o annullata.',
                    suggerimento:
                        'Clicca di nuovo "Condividi schermo" e seleziona una finestra o scheda. ' +
                        'Se il browser blocca l\'accesso, controlla le impostazioni di sistema ' +
                        '(macOS: Preferenze di Sistema → Privacy → Registrazione schermo).',
                };
            case 'NotFoundError':
            case 'DevicesNotFoundError':
                return {
                    tipo: 'device_non_trovato',
                    messaggio: 'Nessuna sorgente schermo disponibile.',
                    suggerimento:
                        'Il browser non ha trovato schermi, finestre o schede condivisibili. ' +
                        'Assicurati di avere almeno una finestra aperta selezionabile.',
                };
            case 'NotReadableError':
                return {
                    tipo: 'device_occupato',
                    messaggio: 'Lo schermo è già acquisito da un\'altra applicazione.',
                    suggerimento:
                        'Chiudi altre applicazioni che potrebbero usare la cattura schermo ' +
                        '(OBS, Teams, Zoom, altre schede che condividono lo schermo) e riprova.',
                };
            case 'AbortError':
                return {
                    tipo: 'condivisione_negata',
                    messaggio: 'Condivisione schermo interrotta.',
                    suggerimento: 'L\'operazione è stata annullata. Clicca di nuovo per riprovare.',
                };
            default:
                return {
                    tipo: 'sconosciuto',
                    messaggio: `Errore condivisione schermo: ${err.name}`,
                    suggerimento: err.message || 'Dettaglio non disponibile.',
                };
        }
    }
    return {
        tipo: 'sconosciuto',
        messaggio: 'Impossibile avviare la condivisione schermo.',
        suggerimento: String(err),
    };
}

/**
 * SDP munging mirato — compatibilità WebView/browser strict.
 *
 * Rimuove solo ciò che causa "Invalid SDP line" su WebView:
 *   1. a=ssrc / a=ssrc-group — deprecate in Unified Plan
 *   2. a=rtcp-fb:XX nack pli — WebView le rifiuta esplicitamente
 *   3. a=rtcp-fb:XX nack (senza sotto-tipo) — stessa famiglia, stesso problema
 *
 * Tutto il resto (fmtp, rtpmap, setup, extmap, codec, m= lines) resta intatto.
 * I browser negoziano i codec nativamente.
 */
export const patchSdp = (sdp: string): string => {
    return sdp
        .split(/\r?\n/)
        .filter(line => {
            if (line.startsWith('a=ssrc:') || line.startsWith('a=ssrc-group:')) return false;
            // Rimuovi "a=rtcp-fb:XX nack" e "a=rtcp-fb:XX nack pli" (WebView le rifiuta)
            if (/^a=rtcp-fb:\d+ nack/.test(line)) return false;
            return true;
        })
        .join('\r\n');
};

/**
 * Fetcha i server ICE (STUN + TURN) dal backend.
 * Il backend li ottiene da Metered.ca e li cacha 50 min.
 * Fallback: solo STUN Google se la fetch fallisce.
 */
export async function getIceServers(): Promise<RTCIceServer[]> {
    try {
        const csrf = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
        const res  = await fetch('/webrtc/ice-servers', {
            headers: { 'X-CSRF-TOKEN': csrf, 'Accept': 'application/json' },
        });
        if (res.ok) {
            const servers = await res.json() as RTCIceServer[];
            console.log('[ICE] servers caricati da backend:', servers.length);
            return servers;
        }
    } catch (e) {
        console.warn('[ICE] fetch /webrtc/ice-servers fallita, uso STUN fallback', e);
    }
    return [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
    ];
}

export const TIMEOUT_MSG: ErroreMedia = {
    tipo: 'timeout_signaling',
    messaggio: 'Il chiosco non risponde al segnale.',
    suggerimento:
        'Verifica che: (1) il browser del chiosco sia aperto su /kiosk, ' +
        '(2) Pusher sia configurato (VITE_PUSHER_APP_KEY nel .env), ' +
        '(3) entrambi i browser usino http://localhost (non IP di rete).',
};
