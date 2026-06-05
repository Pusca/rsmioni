<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Sessioni media per collegamento in chiaro e in nascosto.
 *
 * A differenza di WebRtcController (che gestisce il parlato e le sue transizioni
 * di stato), questo controller gestisce solo il ciclo di vita della sessione media
 * senza toccare lo StatoChiosco — le transizioni sono già avvenute via
 * StatoChioscoController::update().
 *
 * POST /portineria/media/sessione
 *   → Crea una sessione media per il chiosco nello stato corrispondente.
 *     Tipi: 'chiaro' (in_chiaro) | 'nascosto' (in_nascosto)
 *     Trasmette WebRtcSessionCreata al browser del chiosco.
 *
 * POST /portineria/media/chiudi
 *   → Segnala al chiosco la chiusura, poi elimina la sessione.
 *     Non cambia lo StatoChiosco.
 */
class MediaController extends Controller
{
    public function __construct(
        private readonly PortineriaService    $portineria,
        private readonly WebRtcSessionService $webRtcSession,
    ) {}

    /**
     * Crea una sessione media per in_chiaro o in_nascosto.
     *
     * Verifica che il chiosco sia nello stato atteso prima di creare la sessione.
     * Trasmette WebRtcSessionCreata(tipo) al browser del chiosco via Reverb.
     */
    public function creaSessione(Request $request): JsonResponse
    {
        $request->validate([
            'chiosco_id' => ['required', 'string', 'uuid'],
            'tipo'       => ['required', 'in:chiaro,nascosto'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        // Verifica che lo stato corrente corrisponda al tipo richiesto
        $statoAttuale = $this->portineria->statoChiosco($chiosco->id);
        $statoAtteso  = $request->tipo === 'chiaro'
            ? StatoChiosco::InChiaro
            : StatoChiosco::InNascosto;

        if ($statoAttuale !== $statoAtteso) {
            return response()->json([
                'error'   => 'Lo stato del chiosco non corrisponde al tipo di sessione richiesto.',
                'attuale' => $statoAttuale->value,
                'atteso'  => $statoAtteso->value,
            ], 422);
        }

        $sessionId = $this->webRtcSession->crea(
            $request->user()->id,
            $chiosco->id,
            $chiosco->hotel_id,
            $request->tipo,
        );

        // Il chiosco scopre la sessione tramite polling su /kiosk/webrtc/sessione-corrente

        return response()->json([
            'session_id' => $sessionId,
            'chiosco_id' => $chiosco->id,
            'tipo'       => $request->tipo,
        ]);
    }

    /**
     * Chiude una sessione media senza cambiare lo StatoChiosco.
     *
     * Prima invia 'sessione_chiusa' al browser del chiosco via Reverb,
     * poi elimina la sessione dalla Cache.
     */
    public function chiudiSessione(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['required', 'string'],
            'chiosco_id' => ['required', 'string', 'uuid'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        // Accoda il segnale prima di eliminare la sessione
        $this->webRtcSession->accoda(
            $request->session_id,
            'chiosco',
            'sessione_chiusa',
            [],
            'receptionist',
        );

        $this->webRtcSession->chiudi($request->session_id);

        return response()->json(['ok' => true]);
    }
}
