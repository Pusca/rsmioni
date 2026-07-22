<?php

namespace App\Http\Controllers\Portineria;

use App\Http\Controllers\Controller;
use App\Services\LiveKitTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Presenza video del receptionist verso i chioschi.
 *
 * Ogni hotel ha una stanza LiveKit dedicata ("presenza-{hotelId}"), separata
 * dalle sessioni di chiamata: il receptionist vi pubblica la propria webcam a
 * bassa risoluzione finché è operativo in portineria; i chioschi la ricevono
 * in sola visione e mostrano la miniatura "receptionist online".
 *
 * POST /portineria/presenza/token → un token per ciascun hotel dell'utente.
 */
class PresenzaController extends Controller
{
    /** Limite prudenziale di stanze presenza pubblicate insieme. */
    private const MAX_HOTEL = 4;

    public function __construct(
        private readonly LiveKitTokenService $livekit,
    ) {}

    public function token(Request $request): JsonResponse
    {
        if (! $this->livekit->configurato()) {
            return response()->json(['error' => 'LiveKit non configurato sul server.'], 503);
        }

        $utente   = $request->user();
        $hotelIds = array_slice($utente->hotelIds(), 0, self::MAX_HOTEL);

        $stanze = array_map(fn (string $hotelId) => [
            'hotel_id' => $hotelId,
            'url'      => $this->livekit->url(),
            'token'    => $this->livekit->genera(
                room:       'presenza-' . $hotelId,
                identity:   'presenza-recept-' . $utente->id,
                nome:       $utente->username ?? 'Receptionist',
                canPublish: true,
            ),
        ], $hotelIds);

        return response()->json(['stanze' => $stanze])
            ->header('Cache-Control', 'no-store');
    }
}
