<?php

namespace App\Http\Controllers\Configurazioni;

use App\Enums\TipoChiosco;
use App\Enums\TipoPOS;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Hotel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Configurazioni chioschi — accessibile solo al Gestore Hotel.
 *
 * Permette di aggiungere, modificare e disattivare chioschi.
 * La cancellazione fisica non è esposta: usare il flag "attivo = false".
 */
class ChioscoConfigController extends Controller
{
    // ── Lista chioschi ────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $chioschi = Chiosco::whereIn('hotel_id', $hotelIds)
            ->with('hotel:id,nome')
            ->orderBy('hotel_id')
            ->orderBy('nome')
            ->get();

        $hotels = Hotel::whereIn('id', $hotelIds)
            ->orderBy('nome')
            ->get(['id', 'nome']);

        return Inertia::render('Configurazioni/Chioschi', [
            'chioschi' => $chioschi,
            'hotels'   => $hotels,
        ]);
    }

    // ── Form creazione ────────────────────────────────────────────────────────

    public function create(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $hotels = Hotel::whereIn('id', $hotelIds)
            ->orderBy('nome')
            ->get(['id', 'nome']);

        return Inertia::render('Configurazioni/ChioscoEdit', [
            'chiosco' => null,
            'hotels'  => $hotels,
            'mode'    => 'create',
        ]);
    }

    // ── Crea chiosco ──────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $validated = $this->validaChiosco($request, $hotelIds);

        Chiosco::create($validated);

        return redirect()->route('configurazioni.chioschi.index')
            ->with('success', 'Chiosco creato.');
    }

    // ── Form modifica ─────────────────────────────────────────────────────────

    public function edit(Request $request, Chiosco $chiosco): Response
    {
        $user = $request->user();

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $hotels = Hotel::whereIn('id', $user->hotelIds())
            ->orderBy('nome')
            ->get(['id', 'nome']);

        return Inertia::render('Configurazioni/ChioscoEdit', [
            'chiosco' => $chiosco->load('hotel:id,nome'),
            'hotels'  => $hotels,
            'mode'    => 'edit',
        ]);
    }

    // ── Aggiorna chiosco ──────────────────────────────────────────────────────

    public function update(Request $request, Chiosco $chiosco): RedirectResponse
    {
        $user = $request->user();

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $validated = $this->validaChiosco($request, $user->hotelIds(), $chiosco);

        $chiosco->update($validated);

        return back()->with('success', 'Chiosco aggiornato.');
    }

    // ── Validazione condivisa ─────────────────────────────────────────────────

    private function validaChiosco(Request $request, array $hotelIds, ?Chiosco $chiosco = null): array
    {
        $validated = $request->validate([
            'hotel_id'       => ['required', 'uuid', Rule::in($hotelIds)],
            'nome'           => ['required', 'string', 'max:100'],
            'tipo'           => ['required', Rule::enum(TipoChiosco::class)],
            'attivo'         => ['boolean'],
            'interattivo'    => ['boolean'],
            'has_pos'        => ['boolean'],
            'tipo_pos'       => ['nullable', Rule::enum(TipoPOS::class)],
            'has_stampante'  => ['boolean'],
            'ip_address'     => ['nullable', 'string', 'max:100'],
            'path_input_pos' => ['nullable', 'string', 'max:500'],
            'path_output_pos'=> ['nullable', 'string', 'max:500'],
        ], [
            'nome.required'     => 'Il nome del chiosco è obbligatorio.',
            'tipo.required'     => 'Il tipo di chiosco è obbligatorio.',
            'hotel_id.required' => 'Selezionare un hotel.',
        ]);

        // Se has_pos = false, azzera tipo e path POS
        if (! ($validated['has_pos'] ?? false)) {
            $validated['tipo_pos']        = null;
            $validated['path_input_pos']  = null;
            $validated['path_output_pos'] = null;
        }

        return $validated;
    }
}
