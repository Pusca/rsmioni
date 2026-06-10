<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\DiagnosticaChioscoService;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Riceve il heartbeat dal browser del chiosco.
 *
 * Il kiosk invia POST /kiosk/heartbeat ogni 60 secondi con:
 *   - user_agent (string)
 *   - fullscreen  (bool)
 *   - screen_w / screen_h (int)
 *   - url (string)
 *
 * Il backend salva i dati in Cache con TTL 120s.
 * Se il heartbeat si interrompe, la chiave scade e il chiosco
 * risulta "offline" nella diagnostica (ma NON nel runtime Portineria —
 * lo stato Portineria ha TTL separato e transizioni esplicite).
 *
 * Separazione intenzionale: presenza ≠ stato portineria.
 */
class KioskHeartbeatController extends Controller
{
    public function __construct(
        private readonly DiagnosticaChioscoService $diagnostica,
        private readonly PortineriaService         $portineria,
    ) {}

    public function store(Request $request): JsonResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return response()->json(['ok' => false, 'error' => 'Sessione chiosco non attiva'], 401);
        }

        $chiosco = Chiosco::find($chioscoId);
        if (! $chiosco) {
            return response()->json(['ok' => false, 'error' => 'Chiosco non trovato'], 404);
        }

        $validated = $request->validate([
            'user_agent' => ['nullable', 'string', 'max:300'],
            'fullscreen' => ['nullable', 'boolean'],
            'screen_w'   => ['nullable', 'integer', 'min:0', 'max:9999'],
            'screen_h'   => ['nullable', 'integer', 'min:0', 'max:9999'],
            'url'        => ['nullable', 'string', 'max:300'],
        ]);

        $this->diagnostica->salvaHeartbeat($chiosco->id, [
            'user_agent'  => $validated['user_agent']  ?? null,
            'fullscreen'  => $validated['fullscreen']  ?? false,
            'screen_w'    => $validated['screen_w']    ?? null,
            'screen_h'    => $validated['screen_h']    ?? null,
            'url'         => $validated['url']         ?? null,
            'chiosco_id'  => $chiosco->id,
            'chiosco_nome'=> $chiosco->nome,
        ]);

        // Auto-recupero: un chiosco che invia heartbeat è presente → se lo stato
        // Portineria è Offline (es. cache svuotata) lo riporta a Idle.
        if ($this->portineria->statoChiosco($chiosco->id) === StatoChiosco::Offline) {
            $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);
        }

        return response()->json(['ok' => true]);
    }
}
