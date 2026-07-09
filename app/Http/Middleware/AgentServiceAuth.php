<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Autenticazione service-to-service per il worker AI (ai-receptionist).
 *
 * Il worker invia l'header X-Agent-Token con il segreto condiviso
 * (AGENT_SERVICE_TOKEN nel .env di Laravel = RSMIONI_AGENT_HMAC_SECRET nel
 * .env del worker). MVP con bearer statico: la firma HMAC per-richiesta
 * prevista da docs/09 arriva con l'hardening (vedi assumptions A26).
 */
class AgentServiceAuth
{
    public function handle(Request $request, Closure $next): Response
    {
        $atteso = (string) config('services.agent.token');

        if ($atteso === '' || ! hash_equals($atteso, (string) $request->header('X-Agent-Token'))) {
            return response()->json(['error' => 'Non autorizzato.'], 401);
        }

        return $next($request);
    }
}
