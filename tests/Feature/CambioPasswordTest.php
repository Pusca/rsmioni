<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Modulo "Cambio password" (manuale): disponibile per Receptionist,
 * Receptionist Lite e Gestore hotel; vietato al profilo Chiosco.
 */
class CambioPasswordTest extends TestCase
{
    use RefreshDatabase;

    private const NUOVA = 'NuovaPassword2026';

    private function utente(Profilo $profilo): User
    {
        $hotel = Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Test',
            'indirizzo'                => 'Via Test 1',
            'chioschi_concorrenti_max' => 1,
            'checkout_libero'          => false,
            'checkout_ora'             => '10:00:00',
            'lingua_default'           => 'it',
            'lingue_abilitate'         => ['it'],
            'suoneria_attiva'          => true,
            'volume_suoneria'          => 80,
            'numero_massimo_pax'       => 4,
            'campi_pax_obbligatori'    => ['nome', 'cognome'],
        ]);

        $u = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'u_' . Str::random(8),
            'email'        => Str::random(10) . '@test.local',
            'password'     => Hash::make('password'),
            'profilo'      => $profilo,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $u->hotels()->attach($hotel->id);

        return $u;
    }

    public function test_receptionist_cambia_la_password_e_accede_con_quella_nuova(): void
    {
        $u = $this->utente(Profilo::Receptionist);

        $this->actingAs($u)->get('/password')->assertOk();

        $this->actingAs($u)
            ->from('/password')
            ->put('/password', [
                'password_attuale'      => 'password',
                'password'              => self::NUOVA,
                'password_confirmation' => self::NUOVA,
            ])
            ->assertRedirect(route('portineria.index'))
            ->assertSessionHas('success');

        $this->assertTrue(Hash::check(self::NUOVA, $u->fresh()->password));

        $this->post('/logout');
        $this->post('/login', ['username' => $u->username, 'password' => self::NUOVA])
            ->assertRedirect(route('portineria.index'));
    }

    public function test_gestore_torna_alle_prenotazioni_dopo_il_cambio(): void
    {
        $u = $this->utente(Profilo::GestoreHotel);

        $this->actingAs($u)
            ->put('/password', [
                'password_attuale'      => 'password',
                'password'              => self::NUOVA,
                'password_confirmation' => self::NUOVA,
            ])
            ->assertRedirect(route('prenotazioni.index'));
    }

    public function test_receptionist_lite_puo_cambiare_la_password(): void
    {
        $u = $this->utente(Profilo::ReceptionistLite);

        $this->actingAs($u)->get('/password')->assertOk();
    }

    public function test_password_attuale_errata_viene_rifiutata(): void
    {
        $u = $this->utente(Profilo::Receptionist);

        $this->actingAs($u)
            ->from('/password')
            ->put('/password', [
                'password_attuale'      => 'sbagliata',
                'password'              => self::NUOVA,
                'password_confirmation' => self::NUOVA,
            ])
            ->assertRedirect('/password')
            ->assertSessionHasErrors('password_attuale');

        $this->assertTrue(Hash::check('password', $u->fresh()->password));
    }

    public function test_password_debole_viene_rifiutata(): void
    {
        $u = $this->utente(Profilo::Receptionist);

        $this->actingAs($u)
            ->from('/password')
            ->put('/password', [
                'password_attuale'      => 'password',
                'password'              => 'corta1',
                'password_confirmation' => 'corta1',
            ])
            ->assertSessionHasErrors('password');
    }

    public function test_conferma_diversa_viene_rifiutata(): void
    {
        $u = $this->utente(Profilo::Receptionist);

        $this->actingAs($u)
            ->from('/password')
            ->put('/password', [
                'password_attuale'      => 'password',
                'password'              => self::NUOVA,
                'password_confirmation' => self::NUOVA . 'x',
            ])
            ->assertSessionHasErrors('password');
    }

    public function test_chiosco_non_puo_cambiare_la_password(): void
    {
        $u = $this->utente(Profilo::Chiosco);

        $this->actingAs($u)->get('/password')->assertForbidden();
        $this->actingAs($u)->put('/password', [
            'password_attuale'      => 'password',
            'password'              => self::NUOVA,
            'password_confirmation' => self::NUOVA,
        ])->assertForbidden();
    }

    public function test_guest_viene_rediretto_al_login(): void
    {
        $this->get('/password')->assertRedirect(route('login'));
    }
}
