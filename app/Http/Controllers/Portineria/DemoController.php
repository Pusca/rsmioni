<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Controller SOLO per scopi demo/testing.
 * Permette di simulare stati dei chioschi senza hardware reale.
 *
 * ATTENZIONE: da rimuovere o proteggere prima del deploy in produzione.
 * Accessibile solo da Receptionist in APP_ENV=local.
 */
class DemoController extends Controller
{
    public function __construct(private readonly PortineriaService $portineria) {}

    /**
     * POST /portineria/demo/simula
     * Body: { chiosco_id: string, stato: string }
     *
     * Forza uno stato su un chiosco (bypassa la matrice transizioni).
     * Usato per demo e test manuali della UI.
     */
    public function simula(Request $request): JsonResponse
    {
        abort_unless(app()->isLocal(), 404);

        $request->validate([
            'chiosco_id' => ['required', 'uuid', 'exists:chioschi,id'],
            'stato'      => ['required', 'string'],
            'messaggio'  => ['nullable', 'string', 'max:500'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        $stato = StatoChiosco::tryFrom($request->stato) ?? StatoChiosco::Idle;

        $this->portineria->impostaStato($chiosco, $stato, $request->messaggio);

        return response()->json([
            'ok'         => true,
            'chiosco_id' => $chiosco->id,
            'stato'      => $stato->value,
        ]);
    }

    /**
     * POST /portineria/demo/reset
     * Riporta tutti i chioschi dell'utente a "idle".
     */
    public function reset(Request $request): JsonResponse
    {
        abort_unless(app()->isLocal(), 404);

        $hotelIds = $request->user()->hotelIds();
        $chioschi = Chiosco::whereIn('hotel_id', $hotelIds)->get();

        foreach ($chioschi as $chiosco) {
            $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);
        }

        return response()->json(['ok' => true, 'chioschi_reset' => $chioschi->count()]);
    }
}
