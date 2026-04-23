<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('collaudi', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->foreignUuid('chiosco_id')->constrained('chioschi')->cascadeOnDelete();
            $table->foreignUuid('hotel_id')->constrained('hotels')->cascadeOnDelete();
            $table->foreignUuid('eseguito_da')->nullable()->constrained('users')->nullOnDelete();

            // superato | parziale | fallito
            $table->string('esito', 20);

            // 'kiosk' = risultati da browser test eseguiti sul dispositivo
            // 'gestore' = verbale formale registrato dal Gestore Hotel
            $table->string('sorgente', 20)->default('gestore');

            $table->text('note')->nullable();

            // Mappa test_key → { esito: 'ok'|'ko'|'non_testato'|'non_richiesto', dettaglio: string }
            // Chiavi: webcam | microfono | audio | fullscreen | pos | stampante
            $table->json('esiti_test')->nullable();

            $table->string('versione_browser', 200)->nullable();
            $table->string('ip_rilevato', 45)->nullable();

            $table->timestamps();

            $table->index(['chiosco_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('collaudi');
    }
};
