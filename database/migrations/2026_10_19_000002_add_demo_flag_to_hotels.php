<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Segna l'hotel usato per le demo clienti. Solo su questo si applicano
 * le informazioni generiche e la prova degli account receptionist/chiosco.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hotels', function (Blueprint $table) {
            $table->boolean('demo')->default(false)->after('nome');
        });

        DB::table('hotels')
            ->whereIn('nome', ['Hotel Demo Mioni', 'Hotel Demo'])
            ->update(['demo' => true]);
    }

    public function down(): void
    {
        Schema::table('hotels', function (Blueprint $table) {
            $table->dropColumn('demo');
        });
    }
};
