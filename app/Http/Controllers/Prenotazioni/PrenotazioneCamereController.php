<?php

namespace App\Http\Controllers\Prenotazioni;

use App\Http\Controllers\Controller;
use App\Models\Camera;
use App\Models\Prenotazione;
use App\Services\CameraService;
use App\Services\PrenotazioneService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;

/**
 * Gestisce l'assegnazione di camere a una prenotazione.
 *
 * Accessibile a Gestore Hotel e Receptionist pieno.
 * Il Receptionist Lite è escluso dal middleware di route.
 *
 * PUT /prenotazioni/{prenotazione}/camere
 */
class PrenotazioneCamereController extends Controller
{
    public function __construct(
        private readonly CameraService     $cameraService,
        private readonly PrenotazioneService $prenotazioneService,
    ) {}

    public function update(Request $request, string $prenotazioneId): RedirectResponse
    {
        $user = $request->user();
        $pren = Prenotazione::findOrFail($prenotazioneId);

        if (! $this->prenotazioneService->accessoConsentito($user, $pren)) {
            abort(403);
        }

        $validated = $request->validate([
            'camera_ids'   => ['nullable', 'array'],
            'camera_ids.*' => ['uuid'],
        ]);

        $cameraIds = $validated['camera_ids'] ?? [];

        // Verifica che ogni camera appartenga allo stesso hotel
        if (! empty($cameraIds)) {
            $count = Camera::whereIn('id', $cameraIds)
                ->where('hotel_id', $pren->hotel_id)
                ->count();

            if ($count !== count($cameraIds)) {
                return back()->withErrors([
                    'camera_ids' => 'Una o più camere non appartengono all\'hotel della prenotazione.',
                ]);
            }
        }

        try {
            $this->cameraService->assegna($pren, $cameraIds);
        } catch (\DomainException $e) {
            return back()->withErrors(['camera_ids' => $e->getMessage()]);
        }

        return redirect()->route('prenotazioni.show', $pren->id)
            ->with('success', empty($cameraIds)
                ? 'Assegnazione camere rimossa.'
                : 'Camere assegnate con successo.'
            );
    }
}
