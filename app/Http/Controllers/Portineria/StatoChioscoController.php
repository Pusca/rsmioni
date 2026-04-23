<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Gestisce le transizioni di stato dei chioschi dalla Portineria.
 * Risponde JSON (chiamate AJAX da Inertia/fetch, non full page loads).
 */
class StatoChioscoController extends Controller
{
    public function __construct(private readonly PortineriaService $portineria) {}

    /**
     * PATCH /portineria/chioschi/{chiosco}/stato
     * Body: { stato: string, messaggio?: string }
     */
    public function update(Request $request, string $chioscoId): JsonResponse
    {
        $request->validate([
            'stato'    => ['required', Rule::enum(StatoChiosco::class)],
            'messaggio' => ['nullable', 'string', 'max:500'],
        ]);

        $chiosco = Chiosco::findOrFail($chioscoId);

        // Sicurezza: chiosco deve appartenere agli hotel dell'utente
        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        $nuovo = StatoChiosco::from($request->stato);

        $ok = $this->portineria->transizione(
            chiosco:       $chiosco,
            nuovo:         $nuovo,
            profiloCaller: $request->user()->profilo,
            messaggio:     $request->messaggio,
        );

        if (! $ok) {
            $attuale = $this->portineria->statoChiosco($chiosco->id);
            $motivo  = $this->portineria->ultimoMotivoRifiuto();

            return response()->json([
                'error'   => $motivo ?? 'Transizione non consentita',
                'attuale' => $attuale->value,
            ], 422);
        }

        return response()->json([
            'stato'    => $nuovo->value,
            'messaggio' => $request->messaggio,
        ]);
    }

    /**
     * GET /portineria/chioschi/{chiosco}/stato
     * Polling fallback per quando Reverb non è attivo.
     */
    public function show(string $chioscoId): JsonResponse
    {
        $chiosco = Chiosco::findOrFail($chioscoId);

        return response()->json([
            'chiosco_id' => $chiosco->id,
            'stato'      => $this->portineria->statoChiosco($chiosco->id)->value,
            'messaggio'  => $this->portineria->messaggioAttesa($chiosco->id),
        ]);
    }
}
