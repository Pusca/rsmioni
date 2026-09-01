<?php

namespace App\Http\Controllers\Auth;

use App\Enums\Profilo;
use App\Http\Controllers\Controller;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rules\Password;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Cambio password per Receptionist, Receptionist Lite e Gestore hotel.
 *
 * Il profilo Chiosco è escluso a livello di rotta (middleware role): la sua
 * password la gestisce chi installa il chiosco, non l'ospite davanti allo
 * schermo.
 */
class CambioPasswordController extends Controller
{
    public function edit(): Response
    {
        return Inertia::render('Auth/CambioPassword');
    }

    public function update(Request $request): RedirectResponse
    {
        $request->validate([
            'password_attuale' => ['required', 'current_password'],
            'password'         => [
                'required',
                'confirmed',
                'different:password_attuale',
                Password::min(10)->mixedCase()->numbers(),
            ],
        ], [
            'password_attuale.current_password' => 'La password attuale non è corretta.',
            'password.confirmed'                => 'Le due password nuove non coincidono.',
            'password.different'                => 'La nuova password deve essere diversa da quella attuale.',
        ]);

        $utente = $request->user();
        $utente->forceFill(['password' => $request->password])->save();

        // Invalida le altre sessioni aperte con la vecchia password
        $request->session()->regenerate();

        $home = match ($utente->profilo) {
            Profilo::Receptionist, Profilo::ReceptionistLite => route('portineria.index'),
            default                                          => route('prenotazioni.index'),
        };

        return redirect($home)->with('success', 'Password aggiornata.');
    }
}
