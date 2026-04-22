<?php

namespace App\Http\Middleware;

use App\Enums\Profilo;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Controlla la whitelist IP per il profilo Receptionist.
 * Lista vuota = nessun filtro abilitato.
 * Applicato solo al momento del login.
 */
class IpWhitelist
{
    public function handle(Request $request, Closure $next): Response
    {
        $utente = $request->user();

        if (! $utente || $utente->profilo !== Profilo::Receptionist) {
            return $next($request);
        }

        $whitelist = $utente->ip_whitelist ?? [];

        if (empty($whitelist)) {
            // Lista vuota = firewall disabilitato
            return $next($request);
        }

        $ipClient = $request->ip();

        if (! in_array($ipClient, $whitelist, true)) {
            abort(403, "Accesso non consentito dall'indirizzo IP: {$ipClient}");
        }

        return $next($request);
    }
}
