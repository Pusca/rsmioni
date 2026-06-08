<?php

namespace App\Http\Controllers\Portineria;

use App\Http\Controllers\Controller;
use App\Services\LiveKitTokenService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Emette un access token LiveKit per il receptionist su una sessione esistente.
 *
 * La "stanza" LiveKit coincide con il sessionId della sessione chiosco
 * (creata da MediaController per chiaro/nascosto o WebRtcController per parlato).
 *
 * Permessi di pubblicazione in base al tipo:
 *   - chiaro / parlato → il receptionist pubblica (video, e audio nel parlato)
 *   - nascosto         → il receptionist NON pubblica (il guest non deve vederlo)
 *
 * POST /portineria/livekit/token  { session_id }
 */
class LiveKitTokenController extends Controller
{
    public function __construct(
        private readonly LiveKitTokenService  $livekit,
        private readonly WebRtcSessionService $sessioni,
    ) {}

    public function token(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['required', 'string'],
        ]);

        if (! $this->livekit->configurato()) {
            return response()->json(['error' => 'LiveKit non configurato sul server.'], 503);
        }

        $sessionId = $request->session_id;
        $session   = $this->sessioni->trova($sessionId);

        if (! $session || ! $this->sessioni->appartiene($sessionId, $request->user()->id)) {
            return response()->json(['error' => 'Sessione non valida o scaduta.'], 403);
        }

        $tipo       = $session['tipo'] ?? 'parlato';
        $canPublish = $tipo !== 'nascosto'; // nascosto: solo visione, il guest non vede il receptionist

        $token = $this->livekit->genera(
            room:       $sessionId,
            identity:   'recept-' . $request->user()->id,
            nome:       $request->user()->username ?? 'Receptionist',
            canPublish: $canPublish,
        );

        return response()->json([
            'url'         => $this->livekit->url(),
            'token'       => $token,
            'tipo'        => $tipo,
            'can_publish' => $canPublish,
        ])->header('Cache-Control', 'no-store');
    }
}
