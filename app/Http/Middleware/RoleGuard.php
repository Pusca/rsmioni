<?php

namespace App\Http\Middleware;

use App\Enums\Profilo;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Verifica che l'utente autenticato abbia uno dei profili richiesti.
 * Uso: ->middleware('role:receptionist,gestore_hotel')
 */
class RoleGuard
{
    public function handle(Request $request, Closure $next, string ...$profili): Response
    {
        $utente = $request->user();

        if (! $utente || ! $utente->attivo) {
            return redirect()->route('login');
        }

        $profiloUtente = $utente->profilo->value;

        if (! in_array($profiloUtente, $profili, true)) {
            abort(403, 'Accesso non consentito per questo profilo.');
        }

        return $next($request);
    }
}
