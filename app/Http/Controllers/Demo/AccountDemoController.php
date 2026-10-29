<?php

namespace App\Http\Controllers\Demo;

use App\Enums\Profilo;
use App\Http\Controllers\Controller;
use App\Models\Hotel;
use App\Models\User;
use App\Services\SchedaDemoService;
use App\Support\PasswordCasuale;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Account dell'hotel demo: chi fa le demo crea, rinomina e cambia le
 * password degli account di prova da qui, senza passare dalla console.
 *
 * Le password non sono mai leggibili dal database: quando ne viene
 * generata o impostata una, viene mostrata UNA sola volta nella pagina
 * successiva (flash «credenziali»), poi sparisce.
 */
class AccountDemoController extends Controller
{
    /** Profili creabili da questa pagina (quelli del manuale, v1). */
    private const PROFILI = ['gestore_hotel', 'receptionist', 'receptionist_lite', 'chiosco'];

    public function __construct(private readonly SchedaDemoService $schede) {}

    public function index(Request $request): Response
    {
        $hotel = $this->hotelDemo($request);
        $io = $request->user()->id;

        return Inertia::render('Demo/Account', [
            'hotel' => [
                'id'   => $hotel->id,
                'nome' => $hotel->nome,
            ],
            'account' => $this->schede->accounts($hotel)->map(fn (User $u) => [
                'id'       => $u->id,
                'username' => $u->username,
                'email'    => $u->email,
                'profilo'  => $u->profilo->value,
                'etichetta' => $u->profilo->label(),
                'attivo'   => $u->attivo,
                'sei_tu'   => $u->id === $io,
                'altri_hotel' => $u->hotels()->where('hotels.id', '!=', $hotel->id)->count(),
            ])->all(),
            'profili' => collect(self::PROFILI)->map(fn (string $p) => [
                'value' => $p,
                'label' => Profilo::from($p)->label(),
            ])->all(),
            'credenziali' => $request->session()->get('credenziali'),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);

        $dati = $request->validate([
            'username' => ['required', 'string', 'min:3', 'max:40', 'regex:/^[a-z0-9._-]+$/i', Rule::unique('users', 'username')],
            'profilo'  => ['required', Rule::in(self::PROFILI)],
            'email'    => ['nullable', 'email', 'max:120', Rule::unique('users', 'email')],
        ], [
            'username.required' => 'Scrivi il nome utente.',
            'username.regex'    => 'Nome utente: solo lettere, numeri, punto, trattino e underscore.',
            'username.unique'   => 'Esiste già un utente con questo nome.',
            'email.unique'      => 'Esiste già un utente con questa email.',
            'profilo.in'        => 'Profilo non valido.',
        ]);

        $password = PasswordCasuale::genera();
        $utente = User::create([
            'username'     => $dati['username'],
            'email'        => $dati['email'] ?: $dati['username'].'@demo.rsmioni.it',
            'password'     => $password,
            'profilo'      => Profilo::from($dati['profilo']),
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $utente->hotels()->attach($hotel->id);

        return $this->conCredenziali([$this->riga($utente, $password)], "Account «{$utente->username}» creato.");
    }

    public function rigenera(Request $request, User $utente): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);
        $this->assicuraDellHotel($utente, $hotel);

        $password = PasswordCasuale::genera();
        $utente->forceFill(['password' => $password])->save();

        return $this->conCredenziali([$this->riga($utente, $password)], "Nuova password per «{$utente->username}».");
    }

    public function rigeneraTutte(Request $request): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);
        $righe = [];

        foreach ($this->schede->accounts($hotel) as $utente) {
            $password = PasswordCasuale::genera();
            $utente->forceFill(['password' => $password])->save();
            $righe[] = $this->riga($utente, $password);
        }

        return $this->conCredenziali($righe, 'Password rigenerate per tutti gli account demo.');
    }

    public function imposta(Request $request, User $utente): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);
        $this->assicuraDellHotel($utente, $hotel);

        $password = $request->validate([
            'password' => ['required', 'string', 'min:8', 'max:72'],
        ], [
            'password.required' => 'Scrivi la password da impostare.',
            'password.min'      => 'La password deve avere almeno 8 caratteri.',
        ])['password'];

        $utente->forceFill(['password' => $password])->save();

        return $this->conCredenziali([$this->riga($utente, $password)], "Password impostata per «{$utente->username}».");
    }

    public function attivo(Request $request, User $utente): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);
        $this->assicuraDellHotel($utente, $hotel);
        abort_if($utente->id === $request->user()->id, 422, 'Non puoi disattivare il tuo account.');

        $attivo = $request->validate(['attivo' => ['required', 'boolean']])['attivo'];
        $utente->forceFill(['attivo' => (bool) $attivo])->save();

        return redirect()
            ->route('demo.account.index')
            ->with('success', $attivo ? "Account «{$utente->username}» riattivato." : "Account «{$utente->username}» disattivato: non può più entrare.");
    }

    public function destroy(Request $request, User $utente): RedirectResponse
    {
        $hotel = $this->hotelDemo($request);
        $this->assicuraDellHotel($utente, $hotel);
        abort_if($utente->id === $request->user()->id, 422, 'Non puoi eliminare il tuo account.');

        // Se l'account serve anche ad altri hotel lo si stacca soltanto dalla demo.
        $utente->hotels()->detach($hotel->id);
        if ($utente->hotels()->count() === 0) {
            $utente->delete();
        }

        return redirect()
            ->route('demo.account.index')
            ->with('success', "Account «{$utente->username}» eliminato.");
    }

    private function conCredenziali(array $righe, string $messaggio): RedirectResponse
    {
        return redirect()
            ->route('demo.account.index')
            ->with('credenziali', $righe)
            ->with('success', $messaggio);
    }

    /** @return array{username: string, profilo: string, password: string} */
    private function riga(User $utente, string $password): array
    {
        return [
            'username' => $utente->username,
            'profilo'  => $utente->profilo->label(),
            'password' => $password,
        ];
    }

    private function assicuraDellHotel(User $utente, Hotel $hotel): void
    {
        abort_unless($utente->possiedeHotel($hotel->id), 404);
    }

    private function hotelDemo(Request $request): Hotel
    {
        abort_if($request->user()->hotelIds() === [], 403, 'Nessun hotel associato a questo account.');

        $hotel = $this->schede->hotelDemoPer($request->user(), $request->session()->get('hotel_corrente_id'));
        abort_if($hotel === null, 403, 'Nessun hotel demo associato a questo account.');

        return $this->schede->assicurata($hotel);
    }
}
