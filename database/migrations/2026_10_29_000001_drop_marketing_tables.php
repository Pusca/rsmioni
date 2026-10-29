<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * 29/10/2026 — Il modulo Marketing (funnel campagne → lead → appuntamenti,
 * docs/12) è stato tolto dall'app: i lead di RS Mioni non devono stare
 * nell'applicazione usata dai clienti. Le tabelle vanno via con i dati.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('marketing_eventi');
        Schema::dropIfExists('marketing_appuntamenti');
        Schema::dropIfExists('marketing_lead');
        Schema::dropIfExists('marketing_campagne');
    }

    public function down(): void
    {
        // Ricrea lo schema (vuoto) dalla migrazione originale, conservata come storia.
        (require database_path('migrations/2026_10_10_000001_create_marketing_tables.php'))->up();
    }
};
