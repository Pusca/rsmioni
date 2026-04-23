<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\EsitoPOS;
use App\Enums\StatoChiosco;
use App\Enums\TipoPOS;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Pagamento;
use App\Models\Prenotazione;
use App\Services\PortineriaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Gestisce le richieste di pagamento POS remoto lato receptionist/gestore.
 *
 * Vincolo operativo RH24:
 *   Il POS remoto è avviabile SOLO se il chiosco destinatario è nello stato
 *   in_parlato. Questo garantisce che il guest sia presente al chiosco e
 *   il receptionist abbia un collegamento attivo con lui.
 *
 * Flusso:
 *   1. Receptionist/Gestore → POST /pagamenti          (crea record + innesca il POS sul chiosco)
 *   2. Receptionist         → GET  /pagamenti/{chiosco}/stato?pagamento_id=X  (polling esito)
 *   3. Receptionist         → DELETE /pagamenti/{chiosco}  (annulla se necessario)
 *
 * Lato chiosco gestito da KioskPagamentoController.
 * La sincronizzazione usa Laravel Cache (chiave TTL 10 min) + record DB.
 */
class PagamentoPOSController extends Controller
{
    private const TTL_PENDENTE = 600; // 10 minuti

    public function __construct(private readonly PortineriaService $portineriaService) {}

    // ── Crea richiesta pagamento ──────────────────────────────────────────────

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'chiosco_id'      => ['required', 'uuid', 'exists:chioschi,id'],
            'prenotazione_id' => ['required', 'uuid', 'exists:prenotazioni,id'],
            'importo'         => ['required', 'numeric', 'min:0.01', 'max:99999.99'],
            'valuta'          => ['nullable', 'string', 'size:3'],
            'causale'         => ['nullable', 'string', 'max:255'],
        ]);

        $utente   = $request->user();
        $hotelIds = $utente->hotelIds();

        $chiosco = Chiosco::findOrFail($validated['chiosco_id']);
        if (! in_array($chiosco->hotel_id, $hotelIds, true)) {
            abort(403, 'Chiosco non accessibile.');
        }
        if (! $chiosco->has_pos) {
            return response()->json(['errore' => 'Il chiosco non dispone di un POS.'], 422);
        }

        // Vincolo operativo RH24: il POS remoto richiede un collegamento in parlato attivo.
        $statoCorrente = $this->portineriaService->statoChiosco($chiosco->id);
        if ($statoCorrente !== StatoChiosco::InParlato) {
            return response()->json([
                'errore'  => 'Il pagamento POS remoto è disponibile solo durante una sessione di collegamento in parlato con il chiosco.',
                'stato'   => $statoCorrente->value,
            ], 422);
        }

        $prenotazione = Prenotazione::findOrFail($validated['prenotazione_id']);
        if (! in_array($prenotazione->hotel_id, $hotelIds, true)) {
            abort(403, 'Prenotazione non accessibile.');
        }

        // Eventuali pagamenti pendenti precedenti sullo stesso chiosco vengono sovrascritti.
        // Il vecchio record DB resta in stato pending (traccia storica).
        Cache::forget("pagamento_pendente:chiosco_{$chiosco->id}");

        // Crea il record in DB immediatamente — permette lo storico anche se la
        // sessione di polling del receptionist cade prima del completamento.
        $pagamento = Pagamento::create([
            'prenotazione_id'   => $validated['prenotazione_id'],
            'chiosco_id'        => $validated['chiosco_id'],
            'importo_richiesto' => $validated['importo'],
            'valuta'            => $validated['valuta'] ?? 'EUR',
            'causale'           => $validated['causale'] ?? null,
            'esito'             => EsitoPOS::Pending,
            'tipo_pos'          => $chiosco->tipo_pos ?? TipoPOS::Ingenico,
            'eseguito_da'       => $utente->id,
        ]);

        // Segnala al chiosco via cache
        Cache::put("pagamento_pendente:chiosco_{$chiosco->id}", [
            'pagamento_id'    => $pagamento->id,
            'prenotazione_id' => $validated['prenotazione_id'],
            'importo'         => (float) $validated['importo'],
            'valuta'          => $validated['valuta'] ?? 'EUR',
            'causale'         => $validated['causale'] ?? null,
            'tipo_pos'        => $chiosco->tipo_pos?->value ?? 'ingenico',
            'triggered_da'    => $utente->id,
            'created_at'      => now()->toISOString(),
        ], self::TTL_PENDENTE);

        return response()->json([
            'ok'           => true,
            'pagamento_id' => $pagamento->id,
            'chiosco_id'   => $chiosco->id,
        ]);
    }

    // ── Polling stato (lato receptionist) ─────────────────────────────────────

    public function stato(Request $request, string $chioscoId): JsonResponse
    {
        $utente  = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $utente->hotelIds(), true)) {
            abort(403);
        }

        $pagamentoId = $request->query('pagamento_id');
        if (! $pagamentoId) {
            return response()->json(['errore' => 'pagamento_id mancante.'], 422);
        }

        $pagamento = Pagamento::find($pagamentoId);
        if (! $pagamento || $pagamento->chiosco_id !== $chioscoId) {
            return response()->json(['errore' => 'Pagamento non trovato.'], 404);
        }

        return response()->json([
            'esito'              => $pagamento->esito->value,
            'importo_effettivo'  => $pagamento->importo_effettivo,
            'data_operazione'    => $pagamento->data_operazione?->toISOString(),
        ]);
    }

    // ── Annulla richiesta (lato receptionist) ─────────────────────────────────

    public function destroy(Request $request, string $chioscoId): JsonResponse
    {
        $utente  = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $utente->hotelIds(), true)) {
            abort(403);
        }

        $pagamentoId = $request->input('pagamento_id');

        // Rimuove la richiesta dalla cache — il chiosco la leggerà come assente
        Cache::forget("pagamento_pendente:chiosco_{$chioscoId}");

        // Marca il record DB come annullato
        if ($pagamentoId) {
            $pagamento = Pagamento::find($pagamentoId);
            if ($pagamento && $pagamento->esito === EsitoPOS::Pending) {
                $pagamento->update([
                    'esito'           => EsitoPOS::Annullato,
                    'data_operazione' => now(),
                ]);
            }
        }

        return response()->json(['ok' => true]);
    }
}
