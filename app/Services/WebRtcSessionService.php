<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Gestione sessioni WebRTC per collegamento in chiaro, nascosto e parlato.
 *
 * Le sessioni sono ephemere: vivono in Cache con TTL 30 minuti.
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
     * @param string $tipo 'chiaro' | 'nascosto' | 'parlato'
     */
    public function crea(string $receptionistId, string $chioscoId, string $hotelId, string $tipo = 'parlato'): string
    {
        $sessionId = (string) Str::uuid();

        Cache::put("webrtc_session:{$sessionId}", [
            'receptionist_id' => $receptionistId,
            'chiosco_id'      => $chioscoId,
            'hotel_id'        => $hotelId,
            'tipo'            => $tipo,
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
     * Chiude la sessione eliminandola dalla Cache (principale + indice inverso).
     */
    public function chiudi(string $sessionId): void
    {
        $session = $this->trova($sessionId);

        Cache::forget("webrtc_session:{$sessionId}");

        if ($session) {
            Cache::forget("webrtc_sessione_chiosco:{$session['chiosco_id']}");
        }
    }
}
