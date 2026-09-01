<?php

namespace Tests\Feature;

use App\Models\Camera;
use App\Models\Hotel;
use App\Models\User;
use Database\Seeders\DemoSeeder;
use Database\Seeders\VillaGaspariniSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Comandi di messa in produzione: seed dell'hotel reale, creazione utenti
 * con password generata, rimozione dei dati demo.
 */
class ComandiProduzioneTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_villa_gasparini_crea_15_camere_ed_e_idempotente(): void
    {
        $this->seed(VillaGaspariniSeeder::class);
        $this->seed(VillaGaspariniSeeder::class);

        $hotel = Hotel::where('nome', VillaGaspariniSeeder::NOME_HOTEL)->firstOrFail();

        $this->assertSame(1, Hotel::where('nome', VillaGaspariniSeeder::NOME_HOTEL)->count());
        $this->assertSame(15, $hotel->camere()->count());
        $this->assertSame(1, $hotel->chioschi()->count());
        $this->assertSame(6, $hotel->camere()->where('tipo', 'Camera Economy')->count());
        $this->assertSame(3, $hotel->camere()->where('tipo', 'Camera standard')->count());
        $this->assertSame(4, $hotel->camere()->where('tipo', 'Camera superior con Jacuzzi')->count());
        $this->assertSame(2, $hotel->camere()->where('tipo', 'Junior Suite con Jacuzzi')->count());
        $this->assertStringContainsString('Dépendance', Camera::where('hotel_id', $hotel->id)->where('nome', '112')->first()->descrizione);
        $this->assertFalse($hotel->chioschi()->first()->has_pos);
    }

    public function test_crea_utente_genera_una_password_valida_e_associa_l_hotel(): void
    {
        $this->seed(VillaGaspariniSeeder::class);

        $this->artisan('rsmioni:crea-utente', [
            'username' => 'gasparini_gestore',
            'profilo'  => 'gestore_hotel',
            '--hotel'  => [VillaGaspariniSeeder::NOME_HOTEL],
        ])->assertSuccessful();

        $u = User::where('username', 'gasparini_gestore')->firstOrFail();
        $this->assertSame('gestore_hotel', $u->profilo->value);
        $this->assertSame([VillaGaspariniSeeder::NOME_HOTEL], $u->hotels->pluck('nome')->all());
        $this->assertFalse(Hash::check('password', $u->password));
    }

    public function test_crea_utente_rifiuta_duplicati_senza_reset(): void
    {
        $this->seed(VillaGaspariniSeeder::class);
        $args = ['username' => 'dup', 'profilo' => 'receptionist', '--hotel' => [VillaGaspariniSeeder::NOME_HOTEL]];

        $this->artisan('rsmioni:crea-utente', $args)->assertSuccessful();
        $this->artisan('rsmioni:crea-utente', $args)->assertFailed();
        $this->artisan('rsmioni:crea-utente', $args + ['--reset-password' => true])->assertSuccessful();

        $this->assertSame(1, User::where('username', 'dup')->count());
    }

    public function test_rimuovi_demo_elimina_solo_i_dati_demo(): void
    {
        $this->seed(DemoSeeder::class);
        $this->seed(VillaGaspariniSeeder::class);

        $this->artisan('rsmioni:rimuovi-demo', ['--force' => true])->assertSuccessful();

        $this->assertDatabaseMissing('hotels', ['nome' => 'Hotel Demo Mioni']);
        $this->assertDatabaseMissing('users', ['username' => 'receptionist']);
        $this->assertDatabaseMissing('users', ['username' => 'chiosco_demo']);
        $this->assertDatabaseHas('hotels', ['nome' => VillaGaspariniSeeder::NOME_HOTEL]);
        $this->assertSame(15, Camera::count());
    }
}
