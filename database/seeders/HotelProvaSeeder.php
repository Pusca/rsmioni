<?php

namespace Database\Seeders;

use App\Enums\TipoChiosco;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

/**
 * Configura due hotel distinti per il test multi-kiosk:
 *   - Hotel Demo Mioni → "Chiosco Ingresso"  → account chiosco_demo
 *   - Hotel Prova (nuovo) → "Chiosco Sala"    → account chiosco_sala (ex chiosco_demo1)
 *
 * receptionist / receptionist_lite / gestore vengono agganciati a ENTRAMBI gli
 * hotel così possono gestirli insieme dalla Portineria.
 *
 * Idempotente. Esecuzione: php artisan db:seed --class=HotelProvaSeeder --force
 */
class HotelProvaSeeder extends Seeder
{
    public function run(): void
    {
        $demo = Hotel::where('nome', 'Hotel Demo Mioni')->firstOrFail();

        // ── Hotel Prova ───────────────────────────────────────────────────
        $prova = Hotel::firstOrCreate(
            ['nome' => 'Hotel Prova'],
            [
                'id'                       => Str::uuid()->toString(),
                'indirizzo'                => 'Via Prova 1, 35036 Montegrotto Terme (PD)',
                'chioschi_concorrenti_max' => 3,
                'checkout_libero'          => false,
                'checkout_ora'             => '10:00:00',
                'lingua_default'           => 'it',
                'lingue_abilitate'         => ['it', 'en'],
                'suoneria_attiva'          => true,
                'volume_suoneria'          => 80,
                'numero_massimo_pax'       => 4,
                'campi_pax_obbligatori'    => ['nome', 'cognome'],
            ],
        );

        // ── "Chiosco Sala" → spostato su Hotel Prova ──────────────────────
        $sala = Chiosco::where('hotel_id', $demo->id)->where('nome', 'Chiosco Ingresso 1')->first()
            ?? Chiosco::where('hotel_id', $demo->id)->where('nome', 'Chiosco Sala')->first()
            ?? Chiosco::where('hotel_id', $prova->id)->where('nome', 'Chiosco Sala')->first();

        if ($sala) {
            $sala->update([
                'hotel_id'    => $prova->id,
                'nome'        => 'Chiosco Sala',
                'tipo'        => TipoChiosco::Touch,
                'interattivo' => true,
                'attivo'      => true,
            ]);
        } else {
            Chiosco::create([
                'id'          => Str::uuid()->toString(),
                'hotel_id'    => $prova->id,
                'nome'        => 'Chiosco Sala',
                'tipo'        => TipoChiosco::Touch,
                'interattivo' => true,
                'has_pos'     => false,
                'tipo_pos'    => null,
                'has_stampante' => true,
                'attivo'      => true,
                'ip_address'  => '192.168.2.101',
            ]);
        }

        // Hotel Demo Mioni: assicura che il primo chiosco resti "Chiosco Ingresso"
        $ingresso = Chiosco::where('hotel_id', $demo->id)->where('nome', 'Chiosco Ingresso')->first();
        if ($ingresso) {
            $ingresso->update(['tipo' => TipoChiosco::Touch, 'interattivo' => true]);
        }

        // ── Account chiosco: chiosco_demo1 → chiosco_sala su Hotel Prova ──
        $accountSala = User::where('username', 'chiosco_demo1')->first()
            ?? User::where('username', 'chiosco_sala')->first();
        if ($accountSala) {
            $accountSala->update(['username' => 'chiosco_sala', 'email' => 'sala@demo.rsmioni.it']);
            $accountSala->hotels()->sync([$prova->id]); // solo Hotel Prova
        }

        // chiosco_demo resta su Hotel Demo Mioni
        $accountDemo = User::where('username', 'chiosco_demo')->first();
        if ($accountDemo) {
            $accountDemo->hotels()->sync([$demo->id]);
        }

        // receptionist / lite / gestore → entrambi gli hotel
        foreach (['receptionist', 'receptionist_lite', 'gestore'] as $username) {
            $u = User::where('username', $username)->first();
            if ($u && ! $u->hotels()->where('hotels.id', $prova->id)->exists()) {
                $u->hotels()->attach($prova->id);
            }
        }

        $this->command->info('Setup due hotel:');
        $this->command->info('  Hotel Demo Mioni → Chiosco Ingresso (chiosco_demo)');
        $this->command->info('  Hotel Prova      → Chiosco Sala (chiosco_sala, password invariata)');
    }
}
