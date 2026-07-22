/**
 * Tipi condivisi del layer media (LiveKit) — collegamenti chiosco ↔ receptionist.
 *
 * Centralizza le union ridefinite in più file (liveKitCall, useLiveKitChiosco,
 * kioskApi, portineriaApi, AreaVideo, Kiosk/Index).
 */

/** Tipo di sessione media completa: chiaro / nascosto / parlato. */
export type TipoMedia = 'chiaro' | 'nascosto' | 'parlato';

/**
 * Tipo di collegamento video-only creato dalla portineria
 * (API POST /portineria/media/sessione): solo chiaro o nascosto.
 */
export type TipoCollegamento = 'chiaro' | 'nascosto';

/** Stato del collegamento media lato receptionist. */
export type StatoCollegamento = 'idle' | 'waiting_chiosco' | 'connecting' | 'connected' | 'error';

/**
 * Stato della connessione media lato chiosco.
 * NB: distinto da StatoChiosco (types/index.d.ts), che è lo stato runtime
 * di portineria (offline/idle/in_chiamata/…), non lo stato della connessione.
 */
export type StatoMediaChiosco = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Classificazione errori media (getUserMedia / getDisplayMedia / connessione).
 *
 * DOMException.name possibili da getUserMedia:
 *   NotAllowedError / PermissionDeniedError → utente ha negato i permessi
 *   NotReadableError / TrackStartError      → device occupato da altra app/tab
 *   NotFoundError / DevicesNotFoundError    → hardware non trovato
 *   SecurityError                           → non HTTPS e non localhost
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
    tipo:         TipoErroreMedia;
    messaggio:    string;
    suggerimento: string;
}
