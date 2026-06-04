<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class HotelSelectionController extends Controller
{
    /**
     * Salva l'hotel corrente in sessione.
     * L'utente deve avere accesso all'hotel richiesto.
     */
    public function update(Request $request, string $hotelId): JsonResponse
    {
        $user = $request->user();
        $hotelIds = $user->hotelIds();

        if (! in_array($hotelId, $hotelIds, true)) {
            return response()->json(['errore' => 'Hotel non accessibile.'], 403);
        }

        $request->session()->put('hotel_corrente_id', $hotelId);

        return response()->json(['ok' => true]);
    }
}
