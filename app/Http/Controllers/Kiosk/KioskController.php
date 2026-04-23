<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class KioskController extends Controller
{
    public function __construct(private readonly PortineriaService $portineria) {}

    public function index(): Response|RedirectResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return redirect()->route('kiosk.seleziona');
        }

        $chiosco = Chiosco::with('hotel:id,nome')->find($chioscoId);

        if (! $chiosco) {
            session()->forget('chiosco_id');
            return redirect()->route('kiosk.seleziona');
        }

        return Inertia::render('Kiosk/Index', [
            'chiosco'          => $chiosco,
            // Stato runtime e messaggio passati come valori iniziali (SSR).
            // Il frontend li aggiorna via Reverb / polling.
            'stato_iniziale'   => $this->portineria->statoChiosco($chiosco->id)->value,
            'messaggio_attesa' => $this->portineria->messaggioAttesa($chiosco->id),
        ]);
    }

    public function seleziona(Request $request): Response
    {
        $utente    = $request->user();
        $hotelIds  = $utente->hotelIds();
        $chioschi  = Chiosco::whereIn('hotel_id', $hotelIds)
            ->where('attivo', true)
            ->with('hotel:id,nome')
            ->get(['id', 'nome', 'hotel_id', 'tipo']);

        return Inertia::render('Auth/SelezioneChiosco', [
            'chioschi' => $chioschi,
        ]);
    }

    public function storeSeleziona(Request $request): RedirectResponse
    {
        $request->validate([
            'chiosco_id' => ['required', 'uuid', 'exists:chioschi,id'],
        ]);

        session(['chiosco_id' => $request->chiosco_id]);

        // Porta il chiosco in idle quando si connette (default Cache = offline)
        $chiosco = Chiosco::find($request->chiosco_id);
        if ($chiosco && $this->portineria->statoChiosco($chiosco->id) === StatoChiosco::Offline) {
            $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);
        }

        return redirect()->route('kiosk.index');
    }
}
