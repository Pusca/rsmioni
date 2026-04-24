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
/**
 * SDP munging — whitelist dei codec compatibili con tutte le WebView.
 *
 * Strategia: invece di aggiungere codec alla blacklist ad ogni giro
 * (ulpfec, red, rtx, CN, telephone-event, AV1, …), manteniamo solo i codec
 * universalmente supportati dalle WebView anche più datate e scartiamo tutto il resto.
 *
 * Consentiti:
 *   Video : VP8, VP9, H264  — supportati da ogni WebView dal 2014 in poi
 *   Audio : opus, PCMU, PCMA, G722 — codec di base VoIP
 *
 * Rimossi automaticamente (non nell'elenco → esclusi):
 *   AV1, H265, ulpfec, red, flexfec-03, rtx, CN, telephone-event, …
 *
 * Rimosse sempre (indipendentemente dal whitelist):
 *   a=ssrc / a=ssrc-group — deprecate in Unified Plan, Chrome 120+ le rifiuta
 *
 * Algoritmo in 4 passi:
 *   1. Costruisce mappa PT → nome codec da a=rtpmap
 *   2. Calcola allowedPt: PT i cui codec sono in ALLOWED_CODEC_NAMES
 *   3. Filtra le righe: rimuove ssrc* e tutte le a= per PT non consentiti
 *   4. Rimuove i PT non consentiti dalle righe m=
 *      (PT statici senza a=rtpmap — es. PCMU=0 — vengono mantenuti per sicurezza)
 */
const ALLOWED_CODEC_NAMES = /^(VP8|VP9|H264|opus|PCMU|PCMA|G722)$/i;

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
        // PT con a=rtpmap esplicito: mantieni solo se consentito
        if (ptToCodec.has(pt)) return allowedPt.has(pt);
        // PT statico senza a=rtpmap (es. PCMU=0, PCMA=8, G722=9): mantieni
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
