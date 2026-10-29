<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Pagina «Account demo»: password generate e mostrate una sola volta,
 * password scelte a mano, creazione, disattivazione e cancellazione
 * degli account dell'hotel demo.
 */
class AccountDemoTest extends TestCase
{
    use RefreshDatabase;

    private function hotel(string $nome = 'Hotel Demo Mioni', bool $demo = true): Hotel
    {
        return Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => $nome,
            'demo'                     => $demo,
            'indirizzo'                => 'Via Roma 1',
            'chioschi_concorrenti_max' => 3,
            'checkout_libero'          => true,
            'checkout_ora'             => null,
            'lingua_default'           => 'it',
            'lingue_abilitate'         => ['it'],
            'suoneria_attiva'          => true,
            'volume_suoneria'          => 80,
            'numero_massimo_pax'       => 4,
            'campi_pax_obbligatori'    => ['nome', 'cognome'],
        ]);
    }

    private function utente(Profilo $profilo, ?Hotel $hotel = null, ?string $username = null): User
    {
        $utente = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => $username ?? $profilo->value . '_' . Str::random(4),
            'email'        => Str::random(8) . '@test.rsmioni.it',
            'password'     => Hash::make('password'),
            'profilo'      => $profilo,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);

        if ($hotel) {
            $utente->hotels()->attach($hotel->id);
        }

        return $utente;
    }

    public function test_il_gestore_vede_gli_account_dell_hotel_demo_in_ordine_di_profilo(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel, 'gestore');
        $this->utente(Profilo::Receptionist, $hotel, 'receptionist');
        $this->utente(Profilo::Chiosco, $hotel, 'chiosco_demo');
        $this->utente(Profilo::Receptionist, $this->hotel('Altro Hotel', false), 'estraneo');

        $this->actingAs($gestore)
            ->get('/demo/account')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Demo/Account')
                ->where('hotel.id', $hotel->id)
                ->has('account', 3)
                ->where('account.0.username', 'gestore')
                ->where('account.0.sei_tu', true)
                ->where('account.1.username', 'receptionist')
                ->where('account.2.username', 'chiosco_demo')
                ->where('account.2.etichetta', 'Chiosco')
                ->where('credenziali', null)
                ->has('profili', 4)
            );
    }

    public function test_solo_gestore_e_admin_con_hotel_demo_entrano(): void
    {
        $hotel = $this->hotel();

        $this->get('/demo/account')->assertRedirect(route('login'));
        $this->actingAs($this->utente(Profilo::Receptionist, $hotel))->get('/demo/account')->assertForbidden();
        $this->actingAs($this->utente(Profilo::Chiosco, $hotel))->get('/demo/account')->assertForbidden();
        $this->actingAs($this->utente(Profilo::GestoreHotel, $this->hotel('Hotel Vero', false)))->get('/demo/account')->assertForbidden();
    }

    public function test_nuova_password_generata_viene_mostrata_una_sola_volta_e_funziona(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);
        $receptionist = $this->utente(Profilo::Receptionist, $hotel, 'receptionist');

        $risposta = $this->actingAs($gestore)
            ->post("/demo/account/{$receptionist->id}/rigenera")
            ->assertRedirect(route('demo.account.index'));

        $credenziali = $risposta->baseResponse->getSession()->get('credenziali');
        $this->assertCount(1, $credenziali);
        $this->assertSame('receptionist', $credenziali[0]['username']);
        $password = $credenziali[0]['password'];
        $this->assertSame(12, strlen($password));
        $this->assertMatchesRegularExpression('/[a-z]/', $password);
        $this->assertMatchesRegularExpression('/[A-Z]/', $password);
        $this->assertMatchesRegularExpression('/\d/', $password);
        $this->assertTrue(Hash::check($password, $receptionist->fresh()->password));
        $this->assertFalse(Hash::check('password', $receptionist->fresh()->password));

        // La pagina successiva le mostra, quella dopo ancora no.
        $this->get('/demo/account')->assertInertia(fn (Assert $page) => $page->where('credenziali.0.password', $password));
        $this->get('/demo/account')->assertInertia(fn (Assert $page) => $page->where('credenziali', null));
    }

    public function test_rigenera_tutte_cambia_ogni_account_compreso_il_gestore(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel, 'gestore');
        $chiosco = $this->utente(Profilo::Chiosco, $hotel, 'chiosco_demo');
        $estraneo = $this->utente(Profilo::Receptionist, $this->hotel('Altro', false), 'estraneo');

        $risposta = $this->actingAs($gestore)
            ->post('/demo/account/rigenera-tutte')
            ->assertRedirect(route('demo.account.index'));

        // «receptionist» lo aggiunge la scheda demo da sola (account di prova garantiti).
        $credenziali = collect($risposta->baseResponse->getSession()->get('credenziali'))->keyBy('username');
        $this->assertSame(['gestore', 'receptionist', 'chiosco_demo'], $credenziali->keys()->all());
        $this->assertTrue(Hash::check($credenziali['gestore']['password'], $gestore->fresh()->password));
        $this->assertTrue(Hash::check($credenziali['chiosco_demo']['password'], $chiosco->fresh()->password));
        $this->assertTrue(Hash::check('password', $estraneo->fresh()->password));
        $this->assertAuthenticatedAs($gestore);
    }

    public function test_password_scelta_a_mano_richiede_otto_caratteri(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);
        $chiosco = $this->utente(Profilo::Chiosco, $hotel);

        $this->actingAs($gestore)
            ->from('/demo/account')
            ->put("/demo/account/{$chiosco->id}/password", ['password' => 'corta'])
            ->assertSessionHasErrors('password');

        $this->put("/demo/account/{$chiosco->id}/password", ['password' => 'totem-ingresso-2026'])
            ->assertRedirect(route('demo.account.index'))
            ->assertSessionHas('credenziali.0.password', 'totem-ingresso-2026');

        $this->assertTrue(Hash::check('totem-ingresso-2026', $chiosco->fresh()->password));
    }

    public function test_crea_account_collegato_all_hotel_demo_con_password_generata(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $risposta = $this->actingAs($gestore)
            ->post('/demo/account', ['username' => 'receptionist2', 'profilo' => 'receptionist_lite', 'email' => ''])
            ->assertRedirect(route('demo.account.index'));

        $nuovo = User::where('username', 'receptionist2')->firstOrFail();
        $this->assertSame(Profilo::ReceptionistLite, $nuovo->profilo);
        $this->assertSame('receptionist2@demo.rsmioni.it', $nuovo->email);
        $this->assertTrue($nuovo->possiedeHotel($hotel->id));
        $password = $risposta->baseResponse->getSession()->get('credenziali')[0]['password'];
        $this->assertTrue(Hash::check($password, $nuovo->password));

        // Username già usato e profilo fuori elenco vengono rifiutati.
        $this->from('/demo/account')
            ->post('/demo/account', ['username' => 'receptionist2', 'profilo' => 'admin'])
            ->assertSessionHasErrors(['username', 'profilo']);
    }

    public function test_non_tocca_account_di_altri_hotel_ne_se_stesso(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);
        $estraneo = $this->utente(Profilo::Receptionist, $this->hotel('Altro', false));

        $this->actingAs($gestore);
        $this->post("/demo/account/{$estraneo->id}/rigenera")->assertNotFound();
        $this->put("/demo/account/{$estraneo->id}/attivo", ['attivo' => false])->assertNotFound();
        $this->delete("/demo/account/{$estraneo->id}")->assertNotFound();

        $this->put("/demo/account/{$gestore->id}/attivo", ['attivo' => false])->assertStatus(422);
        $this->delete("/demo/account/{$gestore->id}")->assertStatus(422);
        $this->assertTrue($gestore->fresh()->attivo);
    }

    public function test_disattiva_ed_elimina_oppure_stacca_se_usato_altrove(): void
    {
        $hotel = $this->hotel();
        $altro = $this->hotel('Hotel Vero', false);
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);
        $soloDemo = $this->utente(Profilo::Chiosco, $hotel);
        $condiviso = $this->utente(Profilo::Receptionist, $hotel);
        $condiviso->hotels()->attach($altro->id);

        $this->actingAs($gestore);

        $this->put("/demo/account/{$soloDemo->id}/attivo", ['attivo' => false])->assertRedirect();
        $this->assertFalse($soloDemo->fresh()->attivo);

        $this->delete("/demo/account/{$soloDemo->id}")->assertRedirect(route('demo.account.index'));
        $this->assertNull(User::find($soloDemo->id));

        $this->delete("/demo/account/{$condiviso->id}")->assertRedirect(route('demo.account.index'));
        $this->assertNotNull(User::find($condiviso->id));
        $this->assertFalse($condiviso->fresh()->possiedeHotel($hotel->id));
        $this->assertTrue($condiviso->fresh()->possiedeHotel($altro->id));
    }
}
