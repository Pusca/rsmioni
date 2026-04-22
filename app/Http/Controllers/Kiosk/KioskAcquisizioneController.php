<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\ContestoDocumento;
use App\Http\Controllers\Controller;
use App\Services\DocumentoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Lato chiosco per il flusso di acquisizione documento.
 *
 * Il chiosco:
 *   1. Fa polling GET /kiosk/acquisizione-pendente per ricevere richieste
 *   2. Cattura l'immagine via webcam (browser)
 *   3. POST /kiosk/acquisizioni — carica l'immagine acquisita
 *   4. DELETE /kiosk/acquisizioni — annulla se il guest rifiuta
 */
class KioskAcquisizioneController extends Controller
{
    private const TTL_COMPLETATA = 60; // 1 minuto

    public function __construct(private readonly DocumentoService $documentoService) {}

    // ── Polling — il chiosco verifica se c'è una richiesta pendente ───────────

    public function show(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['pendente' => false]);
        }

        $payload = Cache::get("acquisizione_pendente:chiosco_{$chioscoId}");
        if (! $payload) {
            return response()->json(['pendente' => false]);
        }

        return response()->json([
            'pendente'        => true,
            'prenotazione_id' => $payload['prenotazione_id'],
            'titolo'          => $payload['titolo'],
            'lingua'          => $payload['lingua'],
            'tipo_documento'  => $payload['tipo_documento'],
        ]);
    }

    // ── Upload immagine acquisita dal chiosco ─────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['errore' => 'Sessione chiosco non attiva.'], 422);
        }

        $payload = Cache::get("acquisizione_pendente:chiosco_{$chioscoId}");
        if (! $payload) {
            return response()->json(['errore' => 'Nessuna acquisizione pendente o scaduta.'], 422);
        }

        $request->validate([
            'file' => ['required', 'file', 'mimes:png,jpg,jpeg', 'max:10240'],
        ]);

        $utente = $request->user();

        $this->documentoService->upload(
            file:              $request->file('file'),
            contestoTipo:      ContestoDocumento::Prenotazione,
            contestoId:        $payload['prenotazione_id'],
            inseritoDa:        $utente->id,
            inseritoDaProfilo: $utente->profilo->value,
            titolo:            $payload['titolo'] ?? 'Documento acquisito',
            lingua:            $payload['lingua'],
            tipoDocumento:     $payload['tipo_documento'],
        );

        // Rimuove la richiesta pendente e segnala il completamento al receptionist
        Cache::forget("acquisizione_pendente:chiosco_{$chioscoId}");
        Cache::put("acquisizione_completata:chiosco_{$chioscoId}", true, self::TTL_COMPLETATA);

        return response()->json(['ok' => true]);
    }

    // ── Annulla (kiosk o timeout) ─────────────────────────────────────────────

    public function annulla(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if ($chioscoId) {
            Cache::forget("acquisizione_pendente:chiosco_{$chioscoId}");
        }
        return response()->json(['ok' => true]);
    }
}
