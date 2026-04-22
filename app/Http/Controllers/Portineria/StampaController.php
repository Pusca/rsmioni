<?php

namespace App\Http\Controllers\Portineria;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Documento;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Gestisce le richieste di stampa remota verso il chiosco.
 *
 * Flusso:
 *   1. Receptionist/Gestore → POST /stampe             (innesca la stampa)
 *   2. Kiosk                → GET  /kiosk/stampa-pendente (polling)
 *   3. Kiosk                → GET  /kiosk/stampe/documento (scarica il file)
 *   4. Kiosk                → POST /kiosk/stampe/completata (segnala esito)
 *   5. Receptionist         → GET  /stampe/{chiosco}/stato (polling esito)
 *
 * Coordinamento via Cache (stesso pattern di AcquisizioneDocumentoController).
 *
 * Requisito hardware: il chiosco deve avere has_stampante = true.
 */
class StampaController extends Controller
{
    private const TTL_PENDENTE   = 300; // 5 minuti
    private const TTL_COMPLETATA = 60;  // 1 minuto

    // ── Innesca stampa ────────────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'chiosco_id'   => ['required', 'uuid', 'exists:chioschi,id'],
            'documento_id' => ['required', 'uuid', 'exists:documenti,id'],
        ]);

        $utente   = $request->user();
        $hotelIds = $utente->hotelIds();

        // Verifica chiosco: deve appartenere all'hotel, essere attivo e avere stampante
        $chiosco = Chiosco::findOrFail($validated['chiosco_id']);
        if (! in_array($chiosco->hotel_id, $hotelIds, true)) {
            abort(403, 'Chiosco non accessibile.');
        }
        if (! $chiosco->attivo) {
            return response()->json(['errore' => 'Il chiosco non è attivo.'], 422);
        }
        if (! $chiosco->has_stampante) {
            return response()->json(['errore' => 'Il chiosco non ha una stampante collegata.'], 422);
        }

        // Verifica documento: deve appartenere a un hotel accessibile
        $documento = Documento::findOrFail($validated['documento_id']);
        $hotelIdDoc = $this->resolveHotelId($documento);
        if ($hotelIdDoc !== null && ! in_array($hotelIdDoc, $hotelIds, true)) {
            abort(403, 'Documento non accessibile.');
        }

        // Pulisce eventuale completamento precedente
        Cache::forget("stampa_completata:chiosco_{$chiosco->id}");

        Cache::put("stampa_pendente:chiosco_{$chiosco->id}", [
            'documento_id' => $documento->id,
            'titolo'       => $documento->titolo,
            'triggered_da' => $utente->id,
            'created_at'   => now()->toISOString(),
        ], self::TTL_PENDENTE);

        return response()->json(['ok' => true]);
    }

    // ── Polling stato (lato receptionist) ─────────────────────────────────────

    public function stato(Request $request, string $chioscoId): JsonResponse
    {
        $utente  = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $utente->hotelIds(), true)) {
            abort(403);
        }

        $pendente   = Cache::has("stampa_pendente:chiosco_{$chioscoId}");
        $completata = Cache::get("stampa_completata:chiosco_{$chioscoId}");

        if ($completata) {
            Cache::forget("stampa_completata:chiosco_{$chioscoId}");
        }

        return response()->json([
            'pendente'   => $pendente,
            'completata' => $completata !== null,
            'esito'      => $completata['esito']    ?? null,
            'dettaglio'  => $completata['dettaglio'] ?? null,
        ]);
    }

    // ── Annulla stampa (lato receptionist) ────────────────────────────────────

    public function destroy(Request $request, string $chioscoId): JsonResponse
    {
        $utente  = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $utente->hotelIds(), true)) {
            abort(403);
        }

        Cache::forget("stampa_pendente:chiosco_{$chioscoId}");

        return response()->json(['ok' => true]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function resolveHotelId(Documento $documento): ?string
    {
        return match ($documento->contesto_tipo->value) {
            'prenotazione' => \App\Models\Prenotazione::find($documento->contesto_id)?->hotel_id,
            'camera'       => \App\Models\Camera::find($documento->contesto_id)?->hotel_id,
            default        => null,
        };
    }
}
