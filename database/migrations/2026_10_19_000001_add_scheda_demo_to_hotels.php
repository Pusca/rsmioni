<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Scheda che si compila prima di una demo cliente (fuori manuale).
 * Il testo che ne esce viene copiato in istruzioni_ai: Alice non inventa
 * orari, servizi e consigli oltre a quello che c'è scritto qui.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hotels', function (Blueprint $table) {
            $table->json('scheda_demo')->nullable()->after('istruzioni_ai');
        });
    }

    public function down(): void
    {
        Schema::table('hotels', function (Blueprint $table) {
            $table->dropColumn('scheda_demo');
        });
    }
};
