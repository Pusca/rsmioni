<?php

namespace App\Http\Controllers\Portineria;

use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Prenotazione;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Gestisce le richieste di acquisizione documento da webcam chiosco.
 *
 * Flusso:
 *   1. Receptionist/Gestore → POST /acquisizioni  (innesca l'acquisizione)
 *   2. Kiosk                → GET  /kiosk/acquisizione-pendente  (polling)
 *   3. Kiosk                → POST /kiosk/acquisizioni  (upload immagine acquisita)
 *   4. Receptionist         → GET  /acquisizioni/{chiosco}/stato  (polling completamento)
 *
 * La sincronizzazione usa Laravel Cache (chiavi TTL 5 min).
 */
class AcquisizioneDocumentoController extends Controller
{
    private const TTL_PENDENTE    = 300; // 5 minuti
    private const TTL_COMPLETATA  = 60;  // 1 minuto (flag "fatto" lato receptionist)

    // ── Innesca acquisizione ──────────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'chiosco_id'      => ['required', 'uuid', 'exists:chioschi,id'],
            'prenotazione_id' => ['required', 'uuid', 'exists:prenotazioni,id'],
            'titolo'          => ['nullable', 'string', 'max:255'],
            'lingua'          => ['nullable', 'string', 'size:2'],
            'tipo_documento'  => ['nullable', 'string', 'max:100'],
        ]);

        $utente   = $request->user();
        $hotelIds = $utente->hotelIds();

        $chiosco = Chiosco::findOrFail($validated['chiosco_id']);
        if (! in_array($chiosco->hotel_id, $hotelIds, true)) {
            abort(403, 'Chiosco non accessibile.');
        }

        $prenotazione = Prenotazione::findOrFail($validated['prenotazione_id']);
        if (! in_array($prenotazione->hotel_id, $hotelIds, true)) {
            abort(403, 'Prenotazione non accessibile.');
        }

        // Pulisce eventuale completamento precedente sullo stesso chiosco
        Cache::forget("acquisizione_completata:chiosco_{$chiosco->id}");

        Cache::put("acquisizione_pendente:chiosco_{$chiosco->id}", [
            'prenotazione_id' => $validated['prenotazione_id'],
            'titolo'          => $validated['titolo']         ?? null,
            'lingua'          => $validated['lingua']         ?? null,
            'tipo_documento'  => $validated['tipo_documento'] ?? null,
            'triggered_da'    => $utente->id,
            'created_at'      => now()->toISOString(),
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

        $pendente   = Cache::has("acquisizione_pendente:chiosco_{$chioscoId}");
        $completata = Cache::has("acquisizione_completata:chiosco_{$chioscoId}");

        if ($completata) {
            Cache::forget("acquisizione_completata:chiosco_{$chioscoId}");
        }

        return response()->json([
            'pendente'   => $pendente,
            'completata' => $completata,
        ]);
    }

    // ── Annulla acquisizione (lato receptionist) ───────────────────────────────

    public function destroy(Request $request, string $chioscoId): JsonResponse
    {
        $utente  = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $utente->hotelIds(), true)) {
            abort(403);
        }

        Cache::forget("acquisizione_pendente:chiosco_{$chioscoId}");

        return response()->json(['ok' => true]);
    }
}
