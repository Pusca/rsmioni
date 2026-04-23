<?php

namespace App\Http\Controllers\Configurazioni;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\DiagnosticaChioscoService;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Pagina di diagnostica runtime chiosco per il Gestore Hotel.
 *
 * Mostra:
 *   - Presenza/heartbeat
 *   - Stato portineria runtime
 *   - Operazioni pendenti in cache
 *   - Problemi rilevati automaticamente
 *
 * Recovery actions:
 *   - Reset operazioni pendenti (cancella cache acquisizione/stampa/pagamento)
 *   - Forza offline (imposta stato = offline via PortineriaService)
 *   - Reset presenza (cancella heartbeat cache)
 *
 * Permessi: solo Gestore Hotel (middleware route:gestore_hotel).
 * Receptionist escluso.
 */
class DiagnosticaController extends Controller
{
    public function __construct(
        private readonly DiagnosticaChioscoService $diagnostica,
        private readonly PortineriaService         $portineria,
    ) {}

    // ── Pagina principale ─────────────────────────────────────────────────────

    public function show(Request $request, string $chioscoId): Response
    {
        $user    = $request->user();
        $chiosco = Chiosco::with('hotel:id,nome,chioschi_concorrenti_max')->findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $stato = $this->portineria->statoChiosco($chiosco->id);
        $diag  = $this->diagnostica->diagnosticaCompleta($chiosco, $stato);

        return Inertia::render('Configurazioni/Diagnostica', [
            'chiosco'      => $chiosco,
            'diagnostica'  => $diag,
        ]);
    }

    // ── API polling diagnostica (JSON) ────────────────────────────────────────

    /**
     * GET /configurazioni/chioschi/{chiosco}/diagnostica/stato
     * Restituisce la diagnostica aggiornata in JSON per il polling frontend.
     */
    public function statoJson(Request $request, string $chioscoId): JsonResponse
    {
        $user    = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        $stato = $this->portineria->statoChiosco($chiosco->id);
        $diag  = $this->diagnostica->diagnosticaCompleta($chiosco, $stato);

        return response()->json($diag);
    }

    // ── Recovery: reset operazioni pendenti ───────────────────────────────────

    public function resetPendenti(Request $request, string $chioscoId): RedirectResponse
    {
        $user    = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $this->diagnostica->resetPendenti($chiosco->id);

        return back()->with('success', 'Operazioni pendenti annullate.');
    }

    // ── Recovery: forza offline ───────────────────────────────────────────────

    public function forzaOffline(Request $request, string $chioscoId): RedirectResponse
    {
        $user    = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $this->portineria->impostaStato($chiosco, \App\Enums\StatoChiosco::Offline);

        return back()->with('success', 'Stato chiosco forzato a Offline.');
    }

    // ── Recovery: reset presenza ──────────────────────────────────────────────

    public function resetPresenza(Request $request, string $chioscoId): RedirectResponse
    {
        $user    = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $this->diagnostica->resetPresenza($chiosco->id);

        return back()->with('success', 'Presenza (heartbeat) del chiosco resettata.');
    }
}
