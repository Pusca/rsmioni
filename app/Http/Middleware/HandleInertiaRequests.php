<?php

namespace App\Http\Middleware;

use App\Models\Hotel;
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
        $user = $request->user();

        // Determina hotel corrente: da sessione o primo disponibile
        $hotelCorrente = null;
        $hotels = [];
        if ($user) {
            $hotelIds = $user->hotelIds();
            $hotels = Hotel::whereIn('id', $hotelIds)
                ->orderBy('nome')
                ->get(['id', 'nome']);

            $sessionHotelId = $request->session()->get('hotel_corrente_id');
            if ($sessionHotelId && in_array($sessionHotelId, $hotelIds, true)) {
                $hotelCorrente = $hotels->firstWhere('id', $sessionHotelId);
            }
            // Fallback: primo hotel disponibile
            if (! $hotelCorrente && $hotels->isNotEmpty()) {
                $hotelCorrente = $hotels->first();
                $request->session()->put('hotel_corrente_id', $hotelCorrente->id);
            }
        }

        return [
            ...parent::share($request),
            'auth' => [
                'utente' => $user ? [
                    'id'        => $user->id,
                    'username'  => $user->username,
                    'email'     => $user->email,
                    'profilo'   => $user->profilo->value,
                    'hotel_ids' => $user->hotelIds(),
                ] : null,
            ],
            'hotels'        => $hotels,
            'hotel_corrente' => $hotelCorrente ? [
                'id'   => $hotelCorrente->id,
                'nome' => $hotelCorrente->nome,
            ] : null,
            'flash' => [
                'success' => fn () => $request->session()->get('success'),
                'error'   => fn () => $request->session()->get('error'),
            ],
        ];
    }
}
