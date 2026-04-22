<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;

/**
 * Gestisce le chiamate generate dal browser chiosco verso la Portineria.
 *
 * Trigger: il guest tocca lo schermo (touch) o il campanello viene suonato (analogico).
 * Il browser kiosk POSTa /kiosk/chiama → lo stato passa a in_chiamata →
 * ChioscoStatoCambiato viene broadcastato → i receptionist vedono la chiamata in arrivo.
 */
class KioskChiamataController extends Controller
{
    public function __construct(private readonly PortineriaService $portineria) {}

    /**
     * POST /kiosk/chiama
     * Transita il chiosco a in_chiamata.
     * Solo ammissibile da idle.
     */
    public function chiama(): JsonResponse
    {
        $chiosco = $this->chioscoCorrente();
        if (! $chiosco) {
            return response()->json(['error' => 'Nessun chiosco selezionato'], 422);
        }

        $attuale = $this->portineria->statoChiosco($chiosco->id);

        if ($attuale !== StatoChiosco::Idle) {
            return response()->json([
                'error' => 'Chiamata non possibile dallo stato attuale',
                'stato' => $attuale->value,
            ], 422);
        }

        $this->portineria->impostaStato($chiosco, StatoChiosco::InChiamata);

        return response()->json(['stato' => StatoChiosco::InChiamata->value]);
    }

    /**
     * POST /kiosk/annulla-chiamata
     * Annulla la chiamata in corso, torna a idle.
     * Utile se il guest cambia idea prima che il receptionist risponda.
     */
    public function annullaChiamata(): JsonResponse
    {
        $chiosco = $this->chioscoCorrente();
        if (! $chiosco) {
            return response()->json(['error' => 'Nessun chiosco selezionato'], 422);
        }

        $attuale = $this->portineria->statoChiosco($chiosco->id);

        if ($attuale !== StatoChiosco::InChiamata) {
            return response()->json(['stato' => $attuale->value]);
        }

        $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);

        return response()->json(['stato' => StatoChiosco::Idle->value]);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function chioscoCorrente(): ?Chiosco
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return null;
        }

        return Chiosco::find($chioscoId);
    }
}
