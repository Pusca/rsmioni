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

    public function index(Request $request): Response|RedirectResponse
    {
        $chioscoId = session('chiosco_id');

        if (! $chioscoId) {
            return redirect()->route('kiosk.seleziona');
        }

        // Lingue: per le bandierine sul chiosco (l'ospite sceglie in che lingua parlare con l'AI)
        $chiosco = Chiosco::with('hotel:id,nome,lingua_default,lingue_abilitate')->find($chioscoId);

        // Chiosco inesistente o non più dell'hotel dell'account (es. account
        // spostato di hotel, chiosco disattivato): la selezione in sessione
        // non vale più → si torna a scegliere.
        if (! $chiosco || ! $this->appartieneAllAccount($chiosco, $request)) {
            session()->forget('chiosco_id');
            return redirect()->route('kiosk.seleziona');
        }

        // Il chiosco sta caricando la propria pagina → è presente: se lo stato è
        // Offline (es. cache svuotata da un deploy/optimize:clear) lo riporta a Idle.
        if ($this->portineria->statoChiosco($chiosco->id) === StatoChiosco::Offline) {
            $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);
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

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        // Un account chiosco può impersonare SOLO i chioschi attivi degli hotel
        // a cui è associato: l'id arriva dal client e non è fidato.
        if (! $this->appartieneAllAccount($chiosco, $request)) {
            abort(403, 'Il chiosco selezionato non appartiene al tuo hotel.');
        }

        session(['chiosco_id' => $chiosco->id]);

        // Porta il chiosco in idle quando si connette (default Cache = offline)
        if ($this->portineria->statoChiosco($chiosco->id) === StatoChiosco::Offline) {
            $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);
        }

        return redirect()->route('kiosk.index');
    }

    private function appartieneAllAccount(Chiosco $chiosco, Request $request): bool
    {
        return $chiosco->attivo
            && $request->user()->possiedeHotel($chiosco->hotel_id);
    }
}
