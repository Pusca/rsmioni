<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([
            RegoleSeeder::class,
            DemoSeeder::class,
            PrenotazioniSeeder::class,
            CamereSeeder::class,
            ValorizzazioniSeeder::class,
        ]);
    }
}
