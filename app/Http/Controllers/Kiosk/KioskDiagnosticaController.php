<?php

namespace App\Http\Controllers\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\DiagnosticaChioscoService;
use App\Services\PortineriaService;
use Inertia\Inertia;
use Inertia\Response;
use Illuminate\Http\RedirectResponse;

/**
 * Pagina di auto-diagnostica visibile dal dispositivo kiosk.
 *
 * Mostra al tecnico on-site:
 *   - info browser e dispositivo (rilevate lato client)
 *   - stato sessione e heartbeat
 *   - operazioni pendenti in cache
 *
 * Accessibile solo con sessione chiosco_id attiva (profilo Chiosco).
 * URL: GET /kiosk/diagnostica
 */
class KioskDiagnosticaController extends Controller
{
    public function __construct(
        private readonly DiagnosticaChioscoService $diagnostica,
        private readonly PortineriaService         $portineria,
    ) {}

    public function show(): Response|RedirectResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return redirect()->route('kiosk.seleziona');
        }

        $chiosco = Chiosco::with('hotel:id,nome')->findOrFail($chioscoId);

        $presenza = $this->diagnostica->presenza($chiosco->id);
        $pendenti = $this->diagnostica->operazioniPendenti($chiosco->id);
        $stato    = $this->portineria->statoChiosco($chiosco->id)->value;

        return Inertia::render('Kiosk/Diagnostica', [
            'chiosco'  => $chiosco,
            'presenza' => $presenza,
            'pendenti' => $pendenti,
            'stato'    => $stato,
        ]);
    }
}
