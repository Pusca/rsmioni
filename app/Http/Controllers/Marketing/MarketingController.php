<?php

namespace App\Http\Controllers\Marketing;

use App\Http\Controllers\Controller;
use App\Services\MarketingService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Dashboard funnel marketing: campagne → lead → appuntamenti → clienti.
 * Dati a livello piattaforma RS Mioni (non filtrati per hotel).
 */
class MarketingController extends Controller
{
    public function __construct(private readonly MarketingService $service) {}

    public function index(Request $request): Response
    {
        return Inertia::render('Marketing/Index', [
            ...$this->service->dashboard(),
            'profilo' => $request->user()->profilo->value,
        ]);
    }
}
