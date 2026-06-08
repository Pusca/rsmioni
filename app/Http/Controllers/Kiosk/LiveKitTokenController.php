<?php

namespace App\Http\Controllers\Kiosk;

use App\Http\Controllers\Controller;
use App\Services\LiveKitTokenService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;

/**
 * Emette un access token LiveKit per il chiosco sulla sessione attiva corrente.
 *
 * Il chiosco scopre la propria sessione tramite l'indice inverso
 * (chiosco_id → sessionId). La stanza LiveKit coincide con quel sessionId.
 *
 * Il chiosco pubblica sempre il proprio video (in tutti i tipi: anche in
 * "nascosto" pubblica, ed è il receptionist a non pubblicare). L'audio viene
 * pubblicato lato client solo nel parlato.
 *
 * GET /kiosk/livekit/token
 */
class LiveKitTokenController extends Controller
{
    public function __construct(
        private readonly LiveKitTokenService  $livekit,
        private readonly WebRtcSessionService $sessioni,
    ) {}

    public function token(): JsonResponse
    {
        if (! $this->livekit->configurato()) {
            return response()->json(['error' => 'LiveKit non configurato sul server.'], 503);
        }

        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['error' => 'Nessun chiosco selezionato.'], 403);
        }

        $sessionId = $this->sessioni->sessioneAttivaPerChiosco($chioscoId);
        if (! $sessionId) {
            return response()->json(['session_id' => null, 'token' => null, 'tipo' => null]);
        }

        $session = $this->sessioni->trova($sessionId);
        $tipo    = $session['tipo'] ?? 'parlato';

        $token = $this->livekit->genera(
            room:       $sessionId,
            identity:   'kiosk-' . $chioscoId,
            nome:       'Chiosco',
            canPublish: true,
        );

        return response()->json([
            'url'        => $this->livekit->url(),
            'token'      => $token,
            'session_id' => $sessionId,
            'tipo'       => $tipo,
        ])->header('Cache-Control', 'no-store');
    }
}
