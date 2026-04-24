<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * Root template caricato alla prima visita.
     */
    protected $rootView = 'app';

    /**
     * Aggiunge Cache-Control: no-store alle risposte HTML full-page.
     * Impedisce al browser (e alle PWA installate) di mettere in cache l'HTML,
     * garantendo che ad ogni load vengano usati i bundle JS/CSS più recenti.
     * Le risposte Inertia AJAX (header X-Inertia presente) non sono toccate.
     */
    public function handle(Request $request, \Closure $next): mixed
    {
        $response = parent::handle($request, $next);

        if (! $request->header('X-Inertia')) {
            $response->headers->set('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
            $response->headers->set('Pragma', 'no-cache');
        }

        return $response;
    }

    /**
     * Determina la versione degli asset per il cache busting.
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Props condivise con TUTTE le pagine Inertia.
     * Corrisponde all'interfaccia SharedProps in resources/js/types/index.d.ts
     */
    public function share(Request $request): array
    {
        return [
            ...parent::share($request),
            'auth' => [
                'utente' => $request->user() ? [
                    'id'        => $request->user()->id,
                    'username'  => $request->user()->username,
                    'email'     => $request->user()->email,
                    'profilo'   => $request->user()->profilo->value,
                    'hotel_ids' => $request->user()->hotelIds(),
                ] : null,
            ],
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error'   => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
