<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\EsitoCollaudo;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Collaudo;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Gestisce la pagina di collaudo eseguita fisicamente sul dispositivo kiosk.
 *
 * Responsabilità:
 *   - mostrare la pagina collaudo al profilo Chiosco
 *   - raccogliere i risultati dei test browser (webcam, microfono, audio, fullscreen)
 *   - i test hardware (POS, stampante) sono marcati manualmente dal tecnico
 *   - salvare il risultato come collaudo con sorgente='kiosk'
 *
 * Accesso: profilo CHIOSCO con chiosco_id in sessione.
 * URL: GET/POST /kiosk/collaudo
 * Il tecnico accede fisicamente al dispositivo e naviga a questo URL.
 */
class KioskCollaudoController extends Controller
{
    public function show(Request $request): Response|RedirectResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return redirect()->route('kiosk.seleziona');
        }

        $chiosco = Chiosco::with('hotel:id,nome')->findOrFail($chioscoId);

        $ultimoCollaudo = Collaudo::where('chiosco_id', $chioscoId)
            ->where('sorgente', 'kiosk')
            ->orderByDesc('created_at')
            ->first();

        return Inertia::render('Kiosk/Collaudo', [
            'chiosco'         => $chiosco,
            'ultimo_collaudo' => $ultimoCollaudo ? [
                'esito'      => $ultimoCollaudo->esito->value,
                'esiti_test' => $ultimoCollaudo->esiti_test,
                'created_at' => $ultimoCollaudo->created_at?->format('d/m/Y H:i'),
            ] : null,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return response()->json(['error' => 'Sessione scaduta'], 401);
        }

        $chiosco = Chiosco::findOrFail($chioscoId);

        $validated = $request->validate([
            'esiti_test'       => ['required', 'array'],
            'esiti_test.*.esito'     => ['required', 'string', Rule::in(['ok', 'ko', 'non_testato', 'non_richiesto'])],
            'esiti_test.*.dettaglio' => ['nullable', 'string', 'max:500'],
            'versione_browser' => ['nullable', 'string', 'max:200'],
        ]);

        // Calcolo esito globale dai test eseguiti
        $esiti = collect($validated['esiti_test'])->pluck('esito');
        $haKo   = $esiti->contains('ko');
        $hasOk  = $esiti->contains('ok');

        // Escludi non_richiesto dal conteggio
        $rilevanti = $esiti->filter(fn($e) => $e !== 'non_richiesto');
        $tuttiOk   = $rilevanti->isNotEmpty() && $rilevanti->every(fn($e) => $e === 'ok');

        $esito = match(true) {
            $haKo    => EsitoCollaudo::Fallito,
            $tuttiOk => EsitoCollaudo::Superato,
            default  => EsitoCollaudo::Parziale,
        };

        Collaudo::create([
            'chiosco_id'       => $chiosco->id,
            'hotel_id'         => $chiosco->hotel_id,
            'eseguito_da'      => $request->user()->id,
            'esito'            => $esito,
            'sorgente'         => 'kiosk',
            'esiti_test'       => $validated['esiti_test'],
            'versione_browser' => $validated['versione_browser'] ?? null,
            'ip_rilevato'      => $request->ip(),
        ]);

        return response()->json(['ok' => true, 'esito' => $esito->value]);
    }
}
