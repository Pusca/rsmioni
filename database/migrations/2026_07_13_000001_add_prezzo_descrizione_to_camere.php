<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Prezzo a notte e descrizione per l'ospite: servono al receptionist AI per
// proporre le camere disponibili con costi e caratteristiche distintive
// (es. "vista mare", "terrazzo") durante il self check-in.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('camere', function (Blueprint $table) {
            $table->decimal('prezzo_notte', 8, 2)->nullable()->after('mq');
            $table->string('descrizione', 500)->nullable()->after('prezzo_notte');
        });
    }

    public function down(): void
    {
        Schema::table('camere', function (Blueprint $table) {
            $table->dropColumn(['prezzo_notte', 'descrizione']);
        });
    }
};
