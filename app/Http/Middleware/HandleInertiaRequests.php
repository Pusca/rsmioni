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
