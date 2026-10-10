<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Artisan;

/**
 * Carica il funnel marketing da database/data/marketing.json
 * (stesso comando usato in produzione: `php artisan marketing:importa`).
 */
class MarketingSeeder extends Seeder
{
    public function run(): void
    {
        Artisan::call('marketing:importa');
        $this->command?->line(trim(Artisan::output()));
    }
}
