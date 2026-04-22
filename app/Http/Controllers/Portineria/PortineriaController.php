<?php

namespace App\Http\Controllers\Portineria;

use App\Http\Controllers\Controller;
use App\Services\PortineriaService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class PortineriaController extends Controller
{
    public function __construct(private readonly PortineriaService $portineria) {}

    public function index(Request $request): Response
    {
        $utente   = $request->user();
        $hotelIds = $utente->hotelIds();

        return Inertia::render('Portineria/Index', [
            'chioschi'       => $this->portineria->chioschiConStato($hotelIds),
            'hotel_ids'      => $hotelIds,
            'puoInteragire'  => $utente->profilo->haInterattivita(),
        ]);
    }
}
