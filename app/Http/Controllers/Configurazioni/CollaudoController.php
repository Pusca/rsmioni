<?php

namespace App\Http\Controllers\Configurazioni;

use App\Enums\EsitoCollaudo;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Collaudo;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Gestisce la pagina di collaudo chiosco per il Gestore Hotel.
 *
 * Responsabilità:
 *   - mostrare il riepilogo diagnostico del chiosco
 *   - mostrare i risultati dell'ultimo collaudo eseguito sul dispositivo (sorgente=kiosk)
 *   - permettere al Gestore di registrare un verbale formale di collaudo (sorgente=gestore)
 *   - storico collaudi
 *
 * I test browser (webcam, microfono, audio, fullscreen) sono eseguiti
 * fisicamente sul dispositivo kiosk tramite /kiosk/collaudo.
 * I test hardware (POS, stampante) richiedono il kiosk-agent Windows.
 */
class CollaudoController extends Controller
{
    public function show(Request $request, string $chioscoId): Response
    {
        $user    = $request->user();
        $chiosco = Chiosco::with('hotel:id,nome,chioschi_concorrenti_max')->findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $collaudi = Collaudo::where('chiosco_id', $chiosco->id)
            ->with('eseguitoDa:id,username')
            ->orderByDesc('created_at')
            ->limit(10)
            ->get()
            ->map(fn(Collaudo $c) => [
                'id'               => $c->id,
                'esito'            => $c->esito->value,
                'sorgente'         => $c->sorgente,
                'note'             => $c->note,
                'esiti_test'       => $c->esiti_test,
                'versione_browser' => $c->versione_browser,
                'ip_rilevato'      => $c->ip_rilevato,
                'eseguito_da'      => $c->eseguitoDa?->username,
                'created_at'       => $c->created_at?->format('d/m/Y H:i'),
            ]);

        return Inertia::render('Configurazioni/Collaudo', [
            'chiosco'  => $chiosco,
            'collaudi' => $collaudi,
        ]);
    }

    public function store(Request $request, string $chioscoId): RedirectResponse
    {
        $user    = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $validated = $request->validate([
            'esito'       => ['required', Rule::enum(EsitoCollaudo::class)],
            'note'        => ['nullable', 'string', 'max:2000'],
            'esiti_test'  => ['nullable', 'array'],
            'esiti_test.*.esito'    => ['sometimes', 'string', Rule::in(['ok', 'ko', 'non_testato', 'non_richiesto'])],
            'esiti_test.*.dettaglio' => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        Collaudo::create([
            'chiosco_id'  => $chiosco->id,
            'hotel_id'    => $chiosco->hotel_id,
            'eseguito_da' => $user->id,
            'esito'       => $validated['esito'],
            'sorgente'    => 'gestore',
            'note'        => $validated['note'] ?? null,
            'esiti_test'  => $validated['esiti_test'] ?? null,
            'ip_rilevato' => $request->ip(),
        ]);

        return back()->with('success', 'Verbale di collaudo registrato.');
    }
}
