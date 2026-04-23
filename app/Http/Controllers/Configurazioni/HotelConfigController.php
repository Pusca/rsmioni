<?php

namespace App\Http\Controllers\Configurazioni;

use App\Http\Controllers\Controller;
use App\Models\Hotel;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Configurazioni hotel — accessibile solo al Gestore Hotel.
 *
 * Permette di modificare i parametri operativi dell'hotel che influenzano
 * il comportamento dei moduli già implementati (prenotazioni, chioschi, POS, ecc.).
 *
 * Campi esclusi da questa vista (dominio admin/RS Mioni):
 *   - data_inizio_contratto / data_fine_contratto
 *   - delega_rs_mioni
 *   - logo_path / sfondo_kiosk_path (upload file — fuori scope M5B)
 *   - campi_pax_obbligatori (JSON complesso — fuori scope M5B)
 */
class HotelConfigController extends Controller
{
    private const LINGUE_DISPONIBILI = [
        'it' => 'Italiano',
        'en' => 'English',
        'de' => 'Deutsch',
        'fr' => 'Français',
        'es' => 'Español',
    ];

    // ── Visualizza configurazioni ─────────────────────────────────────────────

    public function show(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        // Se il gestore gestisce più hotel, mostriamo tutti.
        // Nella demo è sempre uno solo.
        $hotels = Hotel::whereIn('id', $hotelIds)
            ->orderBy('nome')
            ->get();

        abort_if($hotels->isEmpty(), 403, 'Nessun hotel associato.');

        return Inertia::render('Configurazioni/Hotel', [
            'hotels'             => $hotels,
            'lingue_disponibili' => self::LINGUE_DISPONIBILI,
        ]);
    }

    // ── Aggiorna configurazioni ───────────────────────────────────────────────

    public function update(Request $request, string $hotelId): RedirectResponse
    {
        $user  = $request->user();
        $hotel = Hotel::whereIn('id', $user->hotelIds())->findOrFail($hotelId);

        $validated = $request->validate([
            'nome'                         => ['required', 'string', 'max:200'],
            'indirizzo'                    => ['nullable', 'string', 'max:500'],
            'lingua_default'               => ['required', 'string', 'size:2', Rule::in(array_keys(self::LINGUE_DISPONIBILI))],
            'lingue_abilitate'             => ['nullable', 'array'],
            'lingue_abilitate.*'           => ['string', 'size:2', Rule::in(array_keys(self::LINGUE_DISPONIBILI))],
            'giorni_visibilita_calendario' => ['required', 'integer', 'min:1', 'max:365'],
            'overbooking_permesso'         => ['boolean'],
            'chioschi_concorrenti_max'     => ['required', 'integer', 'min:1', 'max:10'],
            'checkout_libero'              => ['boolean'],
            'checkout_ora'                 => ['nullable', 'string', 'regex:/^\d{2}:\d{2}$/'],
            'suoneria_attiva'              => ['boolean'],
            'volume_suoneria'              => ['required', 'integer', 'min:0', 'max:100'],
            'numero_massimo_pax'           => ['required', 'integer', 'min:1', 'max:20'],
            'giorni_cancellazione_automatica' => ['nullable', 'integer', 'min:1', 'max:365'],
        ], [
            'nome.required'                         => 'Il nome hotel è obbligatorio.',
            'giorni_visibilita_calendario.required' => 'I giorni di visibilità calendario sono obbligatori.',
            'chioschi_concorrenti_max.required'     => 'Il numero massimo di chioschi concorrenti è obbligatorio.',
        ]);

        // Normalizza lingue_abilitate: assicura sempre array, rimuove duplicati
        $validated['lingue_abilitate'] = array_values(
            array_unique($validated['lingue_abilitate'] ?? [])
        );

        // Assicura che la lingua default sia nell'elenco delle lingue abilitate
        if (! in_array($validated['lingua_default'], $validated['lingue_abilitate'], true)) {
            $validated['lingue_abilitate'][] = $validated['lingua_default'];
        }

        // Se checkout libero, svuota l'ora
        if ($validated['checkout_libero'] ?? false) {
            $validated['checkout_ora'] = null;
        }

        $hotel->update($validated);

        return back()->with('success', 'Configurazioni hotel aggiornate.');
    }
}
