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
 * Strategia whitelist + rimozione totale fmtp video:
 *   - Manteniamo solo codec universalmente supportati (VP8, H264, opus, G7xx)
 *   - Rimuoviamo TUTTE le righe a=fmtp per codec VIDEO (VP8, H264):
 *     la WebView rifiuta qualsiasi parametro fmtp video come "Invalid SDP line"
 *     (profile-level-id=64001f, profile-id=2, apt=…, ecc.).
 *     Senza fmtp, H264 default a Constrained Baseline — il profilo più compatibile.
 *   - Le righe a=fmtp audio (opus, PCMU…) vengono mantenute.
 *   - a=ssrc / a=ssrc-group sempre rimossi (deprecati in Unified Plan).
 *
 * Applica PRIMA di setRemoteDescription su ogni offer/answer ricevuto.
 *
 * Algoritmo in 4 passi:
 *   1. Costruisce mappa PT → nome codec da a=rtpmap
 *   2. Calcola allowedPt: PT i cui codec sono in ALLOWED_CODEC_NAMES
 *   3. Filtra le righe: ssrc*, PT non-whitelist, fmtp video
 *   4. Rimuove i PT non consentiti dalle righe m=
 */
const ALLOWED_CODEC_NAMES = /^(VP8|H264|opus|PCMU|PCMA|G722)$/i;
/** Codec video: le loro a=fmtp vengono rimosse integralmente per compatibilità WebView */
const VIDEO_CODEC_NAMES   = /^(VP8|H264)$/i;

export const patchSdp = (sdp: string): string => {
    const lines = sdp.split(/\r?\n/);

    // Passo 1: mappa PT → nome codec (solo righe a=rtpmap esplicite)
    const ptToCodec = new Map<string, string>();
    for (const line of lines) {
        const m = line.match(/^a=rtpmap:(\d+) ([^/\s]+)/);
        if (m) ptToCodec.set(m[1], m[2]);
    }

    // Passo 2: PT dei codec nella whitelist
    const allowedPt = new Set<string>();
    for (const [pt, codec] of ptToCodec) {
        if (ALLOWED_CODEC_NAMES.test(codec)) allowedPt.add(pt);
    }

    // Passo 3: filtra righe
    const filtered = lines.filter(line => {
        // Rimuovi sempre le righe ssrc (deprecate in Unified Plan)
        if (line.startsWith('a=ssrc:') || line.startsWith('a=ssrc-group:')) return false;
        const attr = line.match(/^a=(?:rtpmap|fmtp|rtcp-fb):(\d+)/);
        if (!attr) return true; // non è una riga codec → mantieni
        const pt = attr[1];
        if (ptToCodec.has(pt)) {
            if (!allowedPt.has(pt)) return false; // codec non in whitelist
            // Rimuovi a=fmtp per codec VIDEO: la WebView li rifiuta (profile params, apt, ecc.)
            // H264 senza fmtp → Constrained Baseline di default (massima compatibilità)
            if (line.startsWith('a=fmtp:') && VIDEO_CODEC_NAMES.test(ptToCodec.get(pt) ?? '')) {
                return false;
            }
            return true;
        }
        // PT statico senza a=rtpmap (PCMU=0, PCMA=8, G722=9): mantieni
        return true;
    });

    // Passo 4: rimuovi PT non consentiti dalle righe m=
    return filtered.map(line => {
        if (!line.startsWith('m=')) return line;
        const parts = line.split(' ');
        if (parts.length < 4) return line;
        const cleanPts = parts.slice(3).filter(pt => {
            // PT con rtpmap: consentito solo se in allowedPt
            if (ptToCodec.has(pt)) return allowedPt.has(pt);
            // PT statico senza rtpmap: consentito (PCMU=0, PCMA=8, G722=9)
            return true;
        });
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
