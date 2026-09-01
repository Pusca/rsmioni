<?php

namespace App\Http\Controllers\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\LiveKitTokenService;
use Illuminate\Http\JsonResponse;

/**
 * Accesso del chiosco alla stanza presenza del proprio hotel.
 *
 * Canale "sempre acceso" tra hall e portineria (docs/11):
 *   - il chiosco RICEVE la webcam del receptionist (grande e muta in attesa)
 *     e la sua voce solo quando il receptionist accende il microfono verso
 *     questo chiosco (permessi di sottoscrizione lato receptionist);
 *   - il chiosco PUBBLICA la propria webcam a bassa risoluzione (griglia live
 *     in Portineria) e il microfono solo quando il receptionist glielo chiede
 *     (messaggio dati "mic").
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
            nome:       $chiosco->nome,
            canPublish: true,
        );

        return response()->json([
            'url'   => $this->livekit->url(),
            'token' => $token,
        ])->header('Cache-Control', 'no-store');
    }
}
