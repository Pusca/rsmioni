<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Gestione sessioni WebRTC per collegamento in chiaro, nascosto e parlato.
 *
 * Le sessioni vivono in Cache con TTL 30 minuti "scorrevole": il polling del
 * chiosco (GET /kiosk/livekit/token, ogni 2s) le rinnova via rinnova(), quindi
 * una sessione non scade MAI finché il chiosco è online — termina solo per
 * chiusura esplicita dalla Portineria o se il chiosco sparisce per oltre 30'.
 * Una sessione lega:
 *   sessionId → { receptionist_id, chiosco_id, hotel_id, tipo, creata_at }
 *
 * Campo `tipo`: 'chiaro' | 'nascosto' | 'parlato'
 *   - chiaro:   video bidirezionale, no audio
 *   - nascosto: video unidirezionale (chiosco → receptionist), no audio
 *   - parlato:  video + audio bidirezionale
 *
 * Indice inverso: chiosco_id → sessionId (per recovery al caricamento della pagina kiosk).
 *
 * Non persistite in DB: quando il Cache scade, la sessione è persa.
 */
class WebRtcSessionService
{
    const TTL = 1800; // 30 minuti

    /**
     * Crea una nuova sessione WebRTC e restituisce il sessionId (UUID).
     * Sovrascrive eventuali sessioni precedenti per lo stesso chiosco.
     *
     * @param string $tipo      'chiaro' | 'nascosto' | 'parlato'
     * @param string $gestitaDa 'umano' | 'ai' — chi conduce la sessione (docs/09)
     */
    public function crea(string $receptionistId, string $chioscoId, string $hotelId, string $tipo = 'parlato', string $gestitaDa = 'umano'): string
    {
        $sessionId = (string) Str::uuid();

        Cache::put("webrtc_session:{$sessionId}", [
            'receptionist_id' => $receptionistId,
            'chiosco_id'      => $chioscoId,
            'hotel_id'        => $hotelId,
            'tipo'            => $tipo,
            'gestita_da'      => $gestitaDa,
            'creata_at'       => now()->toIso8601String(),
        ], self::TTL);

        // Indice inverso: chiosco → sessione attiva (per recovery)
        Cache::put("webrtc_sessione_chiosco:{$chioscoId}", $sessionId, self::TTL);

        return $sessionId;
    }

    /**
     * Recupera i dati della sessione, null se non esiste.
     *
     * @return array{receptionist_id: string, chiosco_id: string, hotel_id: string, creata_at: string}|null
     */
    public function trova(string $sessionId): ?array
    {
        return Cache::get("webrtc_session:{$sessionId}");
    }

    /**
     * Restituisce il sessionId attivo per un chiosco, null se non esiste.
     * Usato dal browser kiosk al caricamento della pagina per recuperare sessioni
     * create mentre il browser non era connesso (recovery dalla race condition).
     */
    public function sessioneAttivaPerChiosco(string $chioscoId): ?string
    {
        $sessionId = Cache::get("webrtc_sessione_chiosco:{$chioscoId}");
        if (! $sessionId) {
            return null;
        }

        // Verifica che la sessione esista ancora (potrebbe essere scaduta)
        if (! $this->trova($sessionId)) {
            Cache::forget("webrtc_sessione_chiosco:{$chioscoId}");
            return null;
        }

        return $sessionId;
    }

    /**
     * Rinnova la scadenza della sessione (TTL scorrevole).
     *
     * Chiamato dal polling del chiosco: finché il chiosco è online la sessione
     * resta viva indefinitamente. NON va chiamato dai poll della Portineria,
     * altrimenti una sessione sopravvivrebbe anche a chiosco spento.
     */
    public function rinnova(string $sessionId): void
    {
        $session = $this->trova($sessionId);
        if (! $session) {
            return;
        }

        Cache::put("webrtc_session:{$sessionId}", $session, self::TTL);
        Cache::put("webrtc_sessione_chiosco:{$session['chiosco_id']}", $sessionId, self::TTL);
    }

    /**
     * Verifica se l'utente è un partecipante legittimo alla sessione.
     */
    public function appartiene(string $sessionId, string $userId): bool
    {
        $session = $this->trova($sessionId);
        if (! $session) {
            return false;
        }

        return $session['receptionist_id'] === $userId
            || $session['chiosco_id'] === $userId;
    }

    /**
     * Accoda un segnale WebRTC per il destinatario specificato.
     *
     * I segnali vengono salvati in Cache come array e consumati dal poll.
     * Destinatario: 'receptionist' | 'chiosco'
     */
    public function accoda(string $sessionId, string $destinatario, string $tipo, array $payload, string $mittente): void
    {
        $key     = "webrtc_signals:{$sessionId}:{$destinatario}";
        $signals = Cache::get($key, []);
        $signals[] = [
            'tipo'     => $tipo,
            'payload'  => $payload,
            'mittente' => $mittente,
        ];
        Cache::put($key, $signals, self::TTL);
    }

    /**
     * Preleva e svuota tutti i segnali pendenti per il ruolo specificato.
     *
     * @return array<int, array{tipo: string, payload: array, mittente: string}>
     */
    public function preleva(string $sessionId, string $ruolo): array
    {
        $key     = "webrtc_signals:{$sessionId}:{$ruolo}";
        $signals = Cache::get($key, []);

        if (! empty($signals)) {
            Cache::forget($key);
        }

        return $signals;
    }

    /**
     * Chiude la sessione eliminandola dalla Cache (principale + indice inverso).
     * Le code segnali NON vengono svuotate: l'ultimo poll le consumerà.
     */
    public function chiudi(string $sessionId): void
    {
        $session = $this->trova($sessionId);

        Cache::forget("webrtc_session:{$sessionId}");
        Cache::forget("ai_form:{$sessionId}");

        if ($session) {
            Cache::forget("webrtc_sessione_chiosco:{$session['chiosco_id']}");
        }
    }

    /**
     * Subentro umano su una sessione AI: il receptionist prende la chiamata.
     * La stanza LiveKit resta la stessa (nessuna riconnessione lato chiosco).
     */
    public function subentroUmano(string $sessionId, string $receptionistId): void
    {
        $session = $this->trova($sessionId);
        if (! $session) {
            return;
        }

        $session['gestita_da']      = 'umano';
        $session['receptionist_id'] = $receptionistId;
        Cache::put("webrtc_session:{$sessionId}", $session, self::TTL);
    }

    // ── Form AI (self check-in vocale) ────────────────────────────────────

    /**
     * Registra/aggiorna incrementalmente i campi del form prenotazione che
     * l'AI raccoglie a voce durante il self check-in. I campi nuovi si
     * fondono con quelli già raccolti (l'ospite può correggersi).
     */
    public function aggiornaForm(string $sessionId, array $campi): array
    {
        $form = array_merge($this->form($sessionId), array_filter($campi, fn ($v) => $v !== null));
        Cache::put("ai_form:{$sessionId}", $form, self::TTL);

        return $form;
    }

    /** Campi del form prenotazione raccolti finora dall'AI. */
    public function form(string $sessionId): array
    {
        return Cache::get("ai_form:{$sessionId}", []);
    }
}
