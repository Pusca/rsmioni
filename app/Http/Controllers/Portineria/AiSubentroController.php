<?php

namespace App\Http\Controllers\Portineria;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\LiveKitDispatchService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Subentro del receptionist su una sessione self check-in condotta dall'AI.
 *
 * POST /portineria/ai/subentra { chiosco_id }
 *   La sessione passa a gestita_da='umano' (receptionist corrente), l'agent
 *   viene rimosso dalla stanza LiveKit. La stanza resta la stessa: il chiosco
 *   passa alla normale schermata parlato senza riconnettersi, e da qui in poi
 *   valgono le regole umane (incluso il messaggio di attesa).
 */
class AiSubentroController extends Controller
{
    public function __construct(
        private readonly WebRtcSessionService   $sessioni,
        private readonly LiveKitDispatchService $livekit,
    ) {}

    public function subentra(Request $request): JsonResponse
    {
        $request->validate(['chiosco_id' => ['required', 'string', 'uuid']]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);
        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        $sessionId = $this->sessioni->sessioneAttivaPerChiosco($chiosco->id);
        $session   = $sessionId ? $this->sessioni->trova($sessionId) : null;

        if (! $session || ($session['gestita_da'] ?? 'umano') !== 'ai') {
            return response()->json(['error' => 'Nessuna sessione AI attiva su questo chiosco.'], 422);
        }

        $this->sessioni->subentroUmano($sessionId, $request->user()->id);

        try {
            $this->livekit->rimuoviAgent($sessionId);
        } catch (\Throwable) {
            // best-effort: anche se la rimozione fallisce, la sessione è già umana
        }

        return response()->json(['ok' => true, 'session_id' => $sessionId]);
    }
}
