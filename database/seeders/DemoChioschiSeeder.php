<?php

namespace Database\Seeders;

use App\Enums\TipoChiosco;
use App\Models\Chiosco;
use App\Models\Hotel;
use Illuminate\Database\Seeder;

/**
 * Normalizza i due chioschi demo perché siano due entità DISTINTE e pienamente
 * funzionali per il test multi-kiosk:
 *   - "Chiosco Ingresso"   (già esistente)
 *   - "Chiosco Ingresso 1" (ex "Chiosco Sala", reso Touch/interattivo)
 *
 * Idempotente. Esecuzione: php artisan db:seed --class=DemoChioschiSeeder --force
 */
class DemoChioschiSeeder extends Seeder
{
    public function run(): void
    {
        $hotel = Hotel::where('nome', 'Hotel Demo Mioni')->firstOrFail();

        // Primo chiosco → assicura nome/tipo corretti
        $primo = Chiosco::where('hotel_id', $hotel->id)->where('nome', 'Chiosco Ingresso')->first();
        if ($primo) {
            $primo->update(['tipo' => TipoChiosco::Touch, 'interattivo' => true]);
        }

        // Secondo chiosco → ex "Chiosco Sala" diventa "Chiosco Ingresso 1"
        $secondo = Chiosco::where('hotel_id', $hotel->id)->where('nome', 'Chiosco Sala')->first()
            ?? Chiosco::where('hotel_id', $hotel->id)->where('nome', 'Chiosco Ingresso 1')->first();

        if ($secondo) {
            $secondo->update([
                'nome'        => 'Chiosco Ingresso 1',
                'tipo'        => TipoChiosco::Touch,
                'interattivo' => true,
                'attivo'      => true,
            ]);
        }

        $this->command->info('Chioschi demo normalizzati: "Chiosco Ingresso" + "Chiosco Ingresso 1" (entrambi Touch/interattivi).');
    }
}
