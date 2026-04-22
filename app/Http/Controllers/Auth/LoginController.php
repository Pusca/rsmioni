<?php

namespace App\Http\Controllers\Auth;

use App\Enums\Profilo;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;
use Inertia\Inertia;
use Inertia\Response;

class LoginController extends Controller
{
    public function create(): Response
    {
        return Inertia::render('Auth/Login');
    }

    public function store(Request $request): RedirectResponse
    {
        $request->validate([
            'username' => ['required', 'string'],
            'password' => ['required', 'string'],
        ]);

        if (! Auth::attempt(['username' => $request->username, 'password' => $request->password], false)) {
            throw ValidationException::withMessages([
                'username' => 'Credenziali non valide.',
            ]);
        }

        $utente = Auth::user();

        if (! $utente->attivo) {
            Auth::logout();
            throw ValidationException::withMessages([
                'username' => 'Account disattivato.',
            ]);
        }

        $request->session()->regenerate();

        return match ($utente->profilo) {
            Profilo::Receptionist, Profilo::ReceptionistLite => redirect()->intended(route('portineria.index')),
            Profilo::GestoreHotel                            => redirect()->intended(route('prenotazioni.index')),
            Profilo::Chiosco                                 => $this->redirectChiosco($utente),
            default                                          => redirect('/'),
        };
    }

    private function redirectChiosco($utente): RedirectResponse
    {
        $hotelIds = $utente->hotelIds();

        if (empty($hotelIds)) {
            Auth::logout();

            return redirect()->route('login')->withErrors(['username' => 'Nessun hotel associato al chiosco.']);
        }

        // Se c'è un solo hotel con un solo chiosco, selezione automatica
        if (count($hotelIds) === 1) {
            $chioschi = Chiosco::where('hotel_id', $hotelIds[0])
                ->where('attivo', true)
                ->get();

            if ($chioschi->count() === 1) {
                session(['chiosco_id' => $chioschi->first()->id]);

                return redirect()->route('kiosk.index');
            }
        }

        return redirect()->route('kiosk.seleziona');
    }
}
