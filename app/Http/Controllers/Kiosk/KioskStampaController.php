<?php

namespace App\Http\Controllers\Kiosk;

use App\Http\Controllers\Controller;
use App\Models\Documento;
use App\Services\DocumentoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Lato chiosco per il flusso di stampa remota.
 *
 * Il chiosco:
 *   1. Fa polling GET /kiosk/stampa-pendente per ricevere richieste
 *   2. Scarica il documento: GET /kiosk/stampe/documento
 *   3. Apre il documento in un iframe e chiama window.print()
 *   4. Segnala l'esito: POST /kiosk/stampe/completata
 *   5. Può annullare: DELETE /kiosk/stampe
 *
 * Sicurezza: il document_id è preso dalla cache lato server,
 * mai dal client — il chiosco non può scegliere quale documento stampare.
 */
class KioskStampaController extends Controller
{
    private const TTL_COMPLETATA = 60;

    public function __construct(private readonly DocumentoService $service) {}

    // ── Polling — il chiosco verifica se c'è una stampa pendente ─────────────

    public function show(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['pendente' => false]);
        }

        $payload = Cache::get("stampa_pendente:chiosco_{$chioscoId}");
        if (! $payload) {
            return response()->json(['pendente' => false]);
        }

        return response()->json([
            'pendente'     => true,
            'documento_id' => $payload['documento_id'],
            'titolo'       => $payload['titolo'],
        ]);
    }

    // ── Serve il documento al browser kiosk per la stampa ────────────────────

    public function documento(): StreamedResponse|\Illuminate\Http\Response
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            abort(403, 'Sessione chiosco non attiva.');
        }

        $payload = Cache::get("stampa_pendente:chiosco_{$chioscoId}");
        if (! $payload) {
            abort(404, 'Nessuna stampa pendente o scaduta.');
        }

        $documento = Documento::find($payload['documento_id']);
        if (! $documento) {
            abort(404, 'Documento non trovato.');
        }

        if (! Storage::disk('local')->exists($documento->storage_path)) {
            abort(404, 'File non disponibile.');
        }

        $nome = ($documento->titolo ?? 'documento') . '.' . $documento->estensione;

        return response()->streamDownload(
            function () use ($documento) {
                echo Storage::disk('local')->get($documento->storage_path);
            },
            $nome,
            [
                'Content-Type'        => $this->service->mimeType($documento->estensione),
                'Content-Disposition' => 'inline; filename="' . addslashes($nome) . '"',
            ]
        );
    }

    // ── Segnala completamento stampa ──────────────────────────────────────────

    public function completata(Request $request): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['errore' => 'Sessione chiosco non attiva.'], 422);
        }

        $validated = $request->validate([
            'esito'     => ['required', 'in:ok,errore'],
            'dettaglio' => ['nullable', 'string', 'max:500'],
        ]);

        Cache::forget("stampa_pendente:chiosco_{$chioscoId}");
        Cache::put("stampa_completata:chiosco_{$chioscoId}", [
            'esito'     => $validated['esito'],
            'dettaglio' => $validated['dettaglio'] ?? null,
        ], self::TTL_COMPLETATA);

        return response()->json(['ok' => true]);
    }

    // ── Annulla (kiosk o timeout) ─────────────────────────────────────────────

    public function annulla(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if ($chioscoId) {
            Cache::forget("stampa_pendente:chiosco_{$chioscoId}");
        }
        return response()->json(['ok' => true]);
    }
}
