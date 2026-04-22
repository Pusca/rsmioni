<?php

namespace App\Http\Controllers\Kiosk;

use App\Events\WebRtcSignal;
use App\Http\Controllers\Controller;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * API WebRTC lato chiosco.
 *
 * GET  /kiosk/webrtc/sessione-corrente
 *   → Restituisce il sessionId attivo per il chiosco corrente (recovery).
 *     Usato al caricamento della pagina kiosk per recuperare sessioni create
 *     mentre il browser non era connesso (race condition fix).
 *
 * POST /kiosk/webrtc/signal
 *   → Relay di un segnale WebRTC dal browser chiosco verso il receptionist
 *     (mittente = 'chiosco'). Tipi ammessi: chiosco_ready, answer, ice-candidate.
 */
class KioskWebRtcController extends Controller
{
    public function __construct(
        private readonly WebRtcSessionService $webRtcSession,
    ) {}

    /**
     * Restituisce la sessione WebRTC attiva per il chiosco corrente.
     * null se non c'è nessuna sessione attiva.
     */
    /**
     * Restituisce la sessione WebRTC attiva per il chiosco corrente.
     * null se non c'è nessuna sessione attiva.
     * Include il campo `tipo` ('chiaro'|'nascosto'|'parlato') per il recovery.
     */
    public function sessioneCorrente(): JsonResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return response()->json(['session_id' => null, 'tipo' => null]);
        }

        $sessionId = $this->webRtcSession->sessioneAttivaPerChiosco($chioscoId);

        if (! $sessionId) {
            return response()->json(['session_id' => null, 'tipo' => null]);
        }

        $session = $this->webRtcSession->trova($sessionId);
        $tipo    = $session['tipo'] ?? 'parlato';

        return response()->json(['session_id' => $sessionId, 'tipo' => $tipo]);
    }

    /**
     * Relay di un segnale WebRTC dal chiosco verso il receptionist.
     */
    public function signal(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['required', 'string'],
            'tipo'       => ['required', 'in:chiosco_ready,answer,ice-candidate'],
            'payload'    => ['present', 'array'],
        ]);

        $chioscoSelezionato = session('chiosco_id');

        if (! $chioscoSelezionato) {
            return response()->json(['error' => 'Nessun chiosco selezionato.'], 403);
        }

        $session = $this->webRtcSession->trova($request->session_id);

        if (! $session) {
            return response()->json(['error' => 'Sessione non trovata o scaduta.'], 404);
        }

        if ($session['chiosco_id'] !== $chioscoSelezionato) {
            return response()->json(['error' => 'Sessione non appartiene a questo chiosco.'], 403);
        }

        try {
            broadcast(new WebRtcSignal(
                $request->session_id,
                $request->tipo,
                $request->payload,
                'chiosco',
            ));
        } catch (\Throwable) {
            // Reverb non attivo in dev — ignora silenziosamente
        }

        return response()->json(['ok' => true]);
    }
}
