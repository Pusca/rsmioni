<?php

namespace App\Http\Controllers\Camere;

use App\Http\Controllers\Controller;
use App\Services\CameraService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Endpoint AJAX — disponibilità camere per date + hotel.
 *
 * GET /api/camere-disponibili?hotel_id=&check_in=&check_out=&escludi_prenotazione_id=
 *
 * Risponde con tutte le camere booking_consentito=true, ognuna
 * con il campo `disponibile` che indica se è libera nel periodo richiesto.
 * Accessibile a Gestore Hotel e Receptionist pieno.
 */
class CamereDisponibiliController extends Controller
{
    public function __construct(private readonly CameraService $service) {}

    public function index(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'hotel_id'               => ['required', 'uuid'],
            'check_in'               => ['required', 'date'],
            'check_out'              => ['required', 'date', 'after:check_in'],
            'escludi_prenotazione_id'=> ['nullable', 'uuid'],
        ]);

        // Verifica che l'utente abbia accesso all'hotel
        if (! in_array($validated['hotel_id'], $request->user()->hotelIds(), true)) {
            abort(403);
        }

        $camere = $this->service->camereConDisponibilita(
            hotelId:              $validated['hotel_id'],
            checkIn:              $validated['check_in'],
            checkOut:             $validated['check_out'],
            escludiPrenotazioneId: $validated['escludi_prenotazione_id'] ?? null,
        );

        return response()->json($camere->values());
    }
}
