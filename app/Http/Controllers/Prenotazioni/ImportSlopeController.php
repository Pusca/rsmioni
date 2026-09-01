<?php

namespace App\Http\Controllers\Prenotazioni;

use App\Http\Controllers\Controller;
use App\Models\Hotel;
use App\Services\SlopeImportService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * POST /prenotazioni/importa-slope — solo Gestore hotel.
 * Carica l'export CSV di Slope e fa l'upsert delle prenotazioni dell'hotel.
 */
class ImportSlopeController extends Controller
{
    public function __construct(private readonly SlopeImportService $importer) {}

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'file'     => ['required', 'file', 'mimes:csv,txt', 'max:5120'],
            'hotel_id' => ['nullable', 'uuid'],
        ]);

        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $hotelId = $validated['hotel_id'] ?? (count($hotelIds) === 1 ? $hotelIds[0] : null);
        if (! $hotelId || ! in_array($hotelId, $hotelIds, true)) {
            return back()->with('error', 'Seleziona l\'hotel di destinazione dell\'import.');
        }

        $hotel  = Hotel::findOrFail($hotelId);
        $report = $this->importer->importaCsv(
            (string) file_get_contents($request->file('file')->getRealPath()),
            $hotel,
            $user,
        );

        return redirect()->route('prenotazioni.index')
            ->with('success', $report->riepilogo())
            ->with('import_avvisi', $report->avvisi);
    }
}
