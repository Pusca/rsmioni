<?php

namespace Database\Seeders;

use App\Enums\Profilo;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Aggiunge un SECONDO account chiosco (chiosco_demo1) all'hotel demo esistente,
 * per testare più kiosk contemporaneamente da dispositivi diversi.
 *
 * Idempotente: non duplica l'utente se già presente.
 * Esecuzione: php artisan db:seed --class=ChioscoDemo1Seeder --force
 */
class ChioscoDemo1Seeder extends Seeder
{
    public function run(): void
    {
        $hotel = Hotel::where('nome', 'Hotel Demo Mioni')->firstOrFail();

        $user = User::firstOrCreate(
            ['username' => 'chiosco_demo1'],
            [
                'id'           => Str::uuid()->toString(),
                'email'        => 'chiosco1@demo.rsmioni.it',
                'password'     => Hash::make('password'),
                'profilo'      => Profilo::Chiosco,
                'ip_whitelist' => [],
                'attivo'       => true,
            ],
        );

        if (! $user->hotels()->where('hotels.id', $hotel->id)->exists()) {
            $user->hotels()->attach($hotel->id);
        }

        $this->command->info('Account chiosco aggiunto: chiosco_demo1 (password: password) → ' . $hotel->nome);
    }
}
