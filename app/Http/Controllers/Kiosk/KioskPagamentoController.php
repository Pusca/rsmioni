<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\EsitoPOS;
use App\Http\Controllers\Controller;
use App\Models\Pagamento;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Validation\Rule;

/**
 * Lato chiosco per il flusso di pagamento POS remoto.
 *
 * Il chiosco:
 *   1. Fa polling GET /kiosk/pagamento-pendente per ricevere richieste
 *   2. Mostra la schermata POS all'ospite
 *   3. POST /kiosk/pagamenti/esito — segnala l'esito (ok/ko/annullato)
 *   4. DELETE /kiosk/pagamenti   — annulla la richiesta (timeout o rifiuto)
 *
 * Nota: l'integrazione hardware POS reale (file Ingenico/MyPOS) richiede un
 * layer nativo (Electron/app locale). Qui si usa un adapter mock onesto:
 * il chiosco riceve importo e causale, il receptionist simula l'esito
 * manualmente (o in futuro l'app nativa legge il file di risposta POS).
 */
class KioskPagamentoController extends Controller
{
    // ── Polling — il chiosco verifica se c'è una richiesta pendente ───────────

    public function show(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['pendente' => false]);
        }

        $payload = Cache::get("pagamento_pendente:chiosco_{$chioscoId}");
        if (! $payload) {
            return response()->json(['pendente' => false]);
        }

        return response()->json([
            'pendente'        => true,
            'pagamento_id'    => $payload['pagamento_id'],
            'importo'         => $payload['importo'],
            'valuta'          => $payload['valuta'],
            'causale'         => $payload['causale'],
            'tipo_pos'        => $payload['tipo_pos'],
        ]);
    }

    // ── Segnala esito pagamento dal chiosco ───────────────────────────────────

    public function esito(Request $request): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['errore' => 'Sessione chiosco non attiva.'], 422);
        }

        $payload = Cache::get("pagamento_pendente:chiosco_{$chioscoId}");
        if (! $payload) {
            return response()->json(['errore' => 'Nessun pagamento pendente o scaduto.'], 422);
        }

        $validated = $request->validate([
            'esito'             => ['required', 'string', Rule::in(['ok', 'ko', 'annullato'])],
            'importo_effettivo' => ['nullable', 'numeric', 'min:0'],
        ]);

        $esitoEnum = match ($validated['esito']) {
            'ok'        => EsitoPOS::Ok,
            'ko'        => EsitoPOS::Ko,
            'annullato' => EsitoPOS::Annullato,
        };

        // Aggiorna il record DB
        $pagamento = Pagamento::find($payload['pagamento_id']);
        if ($pagamento && $pagamento->esito === EsitoPOS::Pending) {
            $pagamento->update([
                'esito'             => $esitoEnum,
                'importo_effettivo' => $esitoEnum === EsitoPOS::Ok
                    ? (float) ($validated['importo_effettivo'] ?? $payload['importo'])
                    : null,
                'data_operazione'   => now(),
            ]);
        }

        // Rimuove la richiesta dalla cache
        Cache::forget("pagamento_pendente:chiosco_{$chioscoId}");

        return response()->json(['ok' => true]);
    }

    // ── Annulla (chiosco o timeout) ───────────────────────────────────────────

    public function annulla(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['ok' => true]);
        }

        $payload = Cache::get("pagamento_pendente:chiosco_{$chioscoId}");
        if ($payload) {
            $pagamento = Pagamento::find($payload['pagamento_id']);
            if ($pagamento && $pagamento->esito === EsitoPOS::Pending) {
                $pagamento->update([
                    'esito'           => EsitoPOS::Annullato,
                    'data_operazione' => now(),
                ]);
            }
            Cache::forget("pagamento_pendente:chiosco_{$chioscoId}");
        }

        return response()->json(['ok' => true]);
    }
}
