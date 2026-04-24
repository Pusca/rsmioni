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
 * SDP munging — compatibilità Chrome/WebView (Unified Plan).
 *
 * Problemi noti risolti:
 *   1. `a=ssrc` / `a=ssrc-group` — deprecate in Unified Plan, Chrome 120+ le rifiuta.
 *   2. Codec bloccati (`ulpfec`, `red`, `flexfec-03`, `telephone-event`) — versioni
 *      Chrome/WebView (es. Android WebView) le rifiutano con "Invalid SDP line".
 *   3. RTX a cascata — quando rimuoviamo un codec (es. PT 117 = red), la riga RTX
 *      `a=fmtp:118 apt=117` rimane e referenzia un PT non più in m= → SDP malformato.
 *      Il passo di cascata rimuove automaticamente gli RTX orfani.
 *
 * Applica PRIMA di setRemoteDescription su ogni offer/answer ricevuto.
 *
 * Algoritmo in 5 passi:
 *   1. Costruisce mappa PT → nome codec
 *   2. Identifica PT dei codec bloccati per nome
 *   3. Cascata: blocca RTX il cui `apt` punta a un PT già bloccato
 *   4. Filtra le righe a=ssrc*, a=rtpmap/fmtp/rtcp-fb dei PT bloccati
 *   5. Rimuove i PT bloccati dalle righe m=
 */
// Codec rifiutati dalla WebView del chiosco (Android WebView / Chrome vincolato).
// rtx  = retransmission (non supportato)
// CN   = Comfort Noise  (non supportato, PT statico 13)
// ulpfec / red / flexfec-03 = Forward Error Correction (opzionale)
// telephone-event = DTMF (non necessario per video/parlato)
const BLOCKED_CODEC_NAMES = /^(ulpfec|red|flexfec-03|telephone-event|rtx|CN)$/i;

export const patchSdp = (sdp: string): string => {
    const lines = sdp.split(/\r?\n/);

    // Passo 1: mappa PT → nome codec
    const ptToCodec = new Map<string, string>();
    for (const line of lines) {
        const m = line.match(/^a=rtpmap:(\d+) ([^/\s]+)/);
        if (m) ptToCodec.set(m[1], m[2]);
    }

    // Passo 2: PT dei codec bloccati per nome
    const blockedPt = new Set<string>();
    for (const [pt, codec] of ptToCodec) {
        if (BLOCKED_CODEC_NAMES.test(codec)) blockedPt.add(pt);
    }

    // Passo 3: cascata RTX — blocca RTX il cui apt è già bloccato
    for (const line of lines) {
        const fmtp = line.match(/^a=fmtp:(\d+) apt=(\d+)/);
        if (fmtp && blockedPt.has(fmtp[2])) {
            blockedPt.add(fmtp[1]);
        }
    }

    // Passo 4: filtra righe indesiderate
    const filtered = lines.filter(line => {
        if (line.startsWith('a=ssrc:') || line.startsWith('a=ssrc-group:')) return false;
        const attr = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)/);
        if (attr && blockedPt.has(attr[1])) return false;
        return true;
    });

    // Passo 5: rimuovi PT bloccati dalla riga m=
    return filtered.map(line => {
        if (!line.startsWith('m=') || blockedPt.size === 0) return line;
        // formato: m=<media> <port> <proto> <pt1> <pt2> ...
        const parts = line.split(' ');
        if (parts.length < 4) return line;
        const cleanPts = parts.slice(3).filter(pt => !blockedPt.has(pt));
        return [...parts.slice(0, 3), ...cleanPts].join(' ');
    }).join('\r\n');
};

export const TIMEOUT_MSG: ErroreMedia = {
    tipo: 'timeout_signaling',
    messaggio: 'Il chiosco non risponde al segnale.',
    suggerimento:
        'Verifica che: (1) il browser del chiosco sia aperto su /kiosk, ' +
        '(2) Reverb sia attivo (php artisan reverb:start), ' +
        '(3) entrambi i browser usino http://localhost (non IP di rete).',
};
