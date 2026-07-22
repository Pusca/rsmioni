<?php

namespace App\Http\Controllers\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\LiveKitTokenService;
use Illuminate\Http\JsonResponse;

/**
 * Accesso del chiosco alla stanza presenza del proprio hotel.
 *
 * Sola visione (canPublish=false): il chiosco mostra la miniatura della
 * webcam del receptionist quando questi è operativo in portineria, anche in
 * attesa e durante il self check-in AI. Nessun audio, nessuna pubblicazione.
 *
 * GET /kiosk/presenza/token
 */
class KioskPresenzaController extends Controller
{
    public function __construct(
        private readonly LiveKitTokenService $livekit,
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

        $chiosco = Chiosco::findOrFail($chioscoId);

        $token = $this->livekit->genera(
            room:       'presenza-' . $chiosco->hotel_id,
            identity:   'presenza-kiosk-' . $chiosco->id,
            nome:       'Chiosco',
            canPublish: false,
        );

        return response()->json([
            'url'   => $this->livekit->url(),
            'token' => $token,
        ])->header('Cache-Control', 'no-store');
    }
}
