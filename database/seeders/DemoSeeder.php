<?php

namespace Database\Seeders;

use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Enums\TipoChiosco;
use App\Enums\TipoPOS;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\User;
use App\Services\PortineriaService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // ── Hotel demo ───────────────────────────────────────────────────────
        $hotel = Hotel::create([
            'id'                          => Str::uuid()->toString(),
            'nome'                        => 'Hotel Demo Mioni',
            'indirizzo'                   => 'Via Roma 1, 35036 Montegrotto Terme (PD)',
            'chioschi_concorrenti_max'    => 3,
            'checkout_libero'             => false,
            'checkout_ora'               => '10:00:00',
            'lingua_default'              => 'it',
            'lingue_abilitate'            => ['it', 'en'],
            'logo_path'                   => null,
            'sfondo_kiosk_path'           => null,
            'suoneria_attiva'             => true,
            'volume_suoneria'             => 80,
            'numero_massimo_pax'          => 4,
            'campi_pax_obbligatori'       => ['nome', 'cognome', 'data_nascita', 'documento_numero'],
        ]);

        // ── Chioschi ─────────────────────────────────────────────────────────
        $chiosco1 = Chiosco::create([
            'id'                  => Str::uuid()->toString(),
            'hotel_id'            => $hotel->id,
            'nome'                => 'Chiosco Ingresso',
            'tipo'                => TipoChiosco::Touch,
            'interattivo'         => true,
            'has_pos'             => true,
            'tipo_pos'            => TipoPOS::Ingenico,
            'has_stampante'       => true,
            'attivo'              => true,
            'ip_address'          => '192.168.1.101',
        ]);

        $chiosco2 = Chiosco::create([
            'id'                  => Str::uuid()->toString(),
            'hotel_id'            => $hotel->id,
            'nome'                => 'Chiosco Sala',
            'tipo'                => TipoChiosco::Analogico,
            'interattivo'         => true,
            'has_pos'             => false,
            'tipo_pos'            => null,
            'has_stampante'       => true,
            'attivo'              => true,
            'ip_address'          => '192.168.1.102',
        ]);

        // ── Utente: Receptionist ──────────────────────────────────────────────
        $receptionist = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'receptionist',
            'email'        => 'receptionist@demo.rsmioni.it',
            'password'     => Hash::make('password'),
            'profilo'      => Profilo::Receptionist,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $receptionist->hotels()->attach($hotel->id);

        // ── Utente: Receptionist Lite ─────────────────────────────────────────
        $receptionistLite = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'receptionist_lite',
            'email'        => 'lite@demo.rsmioni.it',
            'password'     => Hash::make('password'),
            'profilo'      => Profilo::ReceptionistLite,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $receptionistLite->hotels()->attach($hotel->id);

        // ── Utente: Gestore Hotel ─────────────────────────────────────────────
        $gestore = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'gestore',
            'email'        => 'gestore@demo.rsmioni.it',
            'password'     => Hash::make('password'),
            'profilo'      => Profilo::GestoreHotel,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $gestore->hotels()->attach($hotel->id);

        // ── Utente: Chiosco (credenziali del kiosk agent) ─────────────────────
        $chioscoUser = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'chiosco_demo',
            'email'        => 'chiosco@demo.rsmioni.it',
            'password'     => Hash::make('password'),
            'profilo'      => Profilo::Chiosco,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $chioscoUser->hotels()->attach($hotel->id);

        // Imposta chioschi a "idle" di default per la demo
        $portineria = app(PortineriaService::class);
        $portineria->impostaStato($chiosco1, StatoChiosco::Idle);
        $portineria->impostaStato($chiosco2, StatoChiosco::Idle);

        $this->command->info('Demo seeded:');
        $this->command->info("  Hotel:              {$hotel->nome}");
        $this->command->info("  Chioschi:           {$chiosco1->nome} (idle), {$chiosco2->nome} (idle)");
        $this->command->info('  Utenti: receptionist / receptionist_lite / gestore / chiosco_demo (password: password)');
    }
}
