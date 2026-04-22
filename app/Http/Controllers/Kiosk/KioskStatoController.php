<?php

namespace App\Http\Controllers\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;

/**
 * Fornisce lo stato corrente del chiosco al browser kiosk.
 * Usato come fallback polling quando Reverb non è disponibile.
 */
class KioskStatoController extends Controller
{
    public function __construct(private readonly PortineriaService $portineria) {}

    /**
     * GET /kiosk/stato
     * Restituisce stato runtime e messaggio attesa del chiosco corrente.
     */
    public function show(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json([
                'stato'           => 'offline',
                'messaggio_attesa' => null,
            ]);
        }

        $chiosco = Chiosco::find($chioscoId);
        if (! $chiosco) {
            return response()->json([
                'stato'           => 'offline',
                'messaggio_attesa' => null,
            ]);
        }

        return response()->json([
            'stato'           => $this->portineria->statoChiosco($chiosco->id)->value,
            'messaggio_attesa' => $this->portineria->messaggioAttesa($chiosco->id),
        ]);
    }
}
