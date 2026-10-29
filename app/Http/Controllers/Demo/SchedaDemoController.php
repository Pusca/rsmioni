<?php

namespace App\Http\Controllers\Demo;

use App\Enums\Profilo;
use App\Http\Controllers\Controller;
use App\Models\Hotel;
use App\Models\User;
use App\Services\RicercaHotelDemo;
use App\Services\SchedaDemoService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Scheda dell'hotel demo: informazioni generiche già pronte,
 * modificabili prima del cliente, e ingresso negli account di prova.
 */
class SchedaDemoController extends Controller
{
    public function __construct(
        private readonly SchedaDemoService $schede,
        private readonly RicercaHotelDemo $ricerca,
    ) {}

    public function index(Request $request): Response
    {
        $hotel = $this->hotelDemo($request);
        $generica = ($hotel->scheda_demo['origine'] ?? 'default') !== 'personalizzata';

        return Inertia::render('Demo/Index', [
            'hotel' => [
                'id'                   => $hotel->id,
                'nome_anagrafica'      => $hotel->nome,
                'camere_in_anagrafica' => $hotel->camere_count,
                'aggiornato_at'        => $hotel->updated_at?->toISOString(),
            ],
            'scheda'   => $this->schede->perForm($hotel->scheda_demo),
            'generica' => $generica,
            'account'  => [
                'receptionist' => $this->schede->account($hotel, Profilo::Receptionist)?->username,
                'chiosco'      => $this->schede->account($hotel, Profilo::Chiosco)?->username,
            ],
        ]);
    }

    public function update(Request $request): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);

        $validated = $request->validate([
            'nome'              => ['required', 'string', 'max:200'],
            'numero_camere'     => ['required', 'integer', 'min:1', 'max:500'],
            'checkin'           => ['nullable', 'string', 'max:300'],
            'checkout'          => ['nullable', 'string', 'max:300'],
            'colazione'         => ['nullable', 'string', 'max:300'],
            'autobus'           => ['nullable', 'string', 'max:300'],
            'trasporto'         => ['nullable', 'string', 'max:500'],
            'ristoranti'        => ['nullable', 'array', 'max:20'],
            'ristoranti.*.nome' => ['nullable', 'string', 'max:120'],
            'ristoranti.*.nota' => ['nullable', 'string', 'max:240'],
            'luoghi'            => ['nullable', 'array', 'max:20'],
            'luoghi.*.nome'     => ['nullable', 'string', 'max:120'],
            'luoghi.*.nota'     => ['nullable', 'string', 'max:240'],
            'note'              => ['nullable', 'string', 'max:3000'],
            'password_prova'    => ['nullable', 'string', 'min:8', 'max:72'],
        ], [
            'nome.required'          => 'Il nome dell\'hotel in demo è obbligatorio.',
            'numero_camere.required' => 'Indica quante camere comunicare.',
            'numero_camere.min'      => 'Il numero di camere deve essere almeno 1.',
            'password_prova.min'     => 'La password degli account di prova deve avere almeno 8 caratteri.',
        ]);

        $password = $validated['password_prova'] ?? null;
        unset($validated['password_prova']);

        $this->schede->salva($hotel, $validated);
        if (is_string($password) && $password !== '') {
            $this->schede->impostaPasswordProva($hotel, $password);
        }

        return redirect()
            ->route('demo.index')
            ->with('success', 'Impostazioni demo salvate. L\'hotel di prova le usa già.');
    }

    public function cerca(Request $request): JsonResponse
    {
        $this->hotelDemo($request);
        $nome = $request->validate([
            'nome' => ['required', 'string', 'min:3', 'max:200'],
        ], [
            'nome.required' => 'Scrivi il nome dell\'hotel, meglio se con la città.',
            'nome.min'      => 'Scrivi il nome dell\'hotel, meglio se con la città.',
        ])['nome'];

        try {
            $risultato = $this->ricerca->cerca($nome);
        } catch (\RuntimeException $e) {
            return response()->json(['message' => $e->getMessage()], 503);
        }

        if ($risultato === null) {
            return response()->json([
                'message' => 'Nessun hotel trovato. Aggiungi la città, per esempio «Villa Gasparini Montegrotto».',
            ], 422);
        }

        return response()->json($risultato);
    }

    public function ripristina(Request $request): RedirectResponse
    {
        $this->schede->ripristina($this->hotelDemo($request));

        return redirect()
            ->route('demo.index')
            ->with('success', 'Ripristinato l\'hotel demo generico.');
    }

    public function prova(Request $request): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);
        $come = $request->validate([
            'come' => ['required', 'in:receptionist,chiosco'],
        ])['come'];

        $profilo = $come === 'chiosco' ? Profilo::Chiosco : Profilo::Receptionist;
        $account = $this->schede->account($hotel, $profilo);
        abort_if($account === null, 422, 'Account demo non disponibile.');

        $gestoreId = $request->user()->id;
        Auth::login($account);
        $request->session()->regenerate();
        $request->session()->put('demo_impersonator_id', $gestoreId);
        $request->session()->put('hotel_corrente_id', $hotel->id);

        if ($come === 'chiosco') {
            $chiosco = $hotel->chioschi()->where('attivo', true)->first();
            abort_if($chiosco === null, 422, 'Nessun chiosco attivo sull\'hotel demo.');
            $request->session()->put('chiosco_id', $chiosco->id);

            return redirect()->route('kiosk.index');
        }

        return redirect()->route('portineria.index');
    }

    public function torna(Request $request): RedirectResponse
    {
        $id = $request->session()->pull('demo_impersonator_id');
        $request->session()->forget('chiosco_id');
        abort_unless(is_string($id), 403);

        $gestore = User::findOrFail($id);
        abort_unless(
            in_array($gestore->profilo, [Profilo::GestoreHotel, Profilo::Admin], true),
            403
        );

        Auth::login($gestore);
        $request->session()->regenerate();
        // hotel_corrente_id resta quello della demo: HandleInertiaRequests
        // lo accetta perché è tra gli hotel del gestore.

        return redirect()->route('demo.index');
    }

    private function hotelDemo(Request $request): Hotel
    {
        abort_if($request->user()->hotelIds() === [], 403, 'Nessun hotel associato a questo account.');

        $hotel = $this->schede->hotelDemoPer($request->user(), $request->session()->get('hotel_corrente_id'));
        abort_if($hotel === null, 403, 'Nessun hotel demo associato a questo account.');

        return $this->schede->assicurata($hotel);
    }
}
