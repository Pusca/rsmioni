<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('regole', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codice')->unique()->comment('Es. DESCRIZIONE_STRUTTURA, RISTORANTI_CONSIGLIATI');
            $table->string('categoria')->comment('generale | turistica | supporto | sicurezza');
            $table->unsignedSmallInteger('ordine')->default(0)->comment('Ordine visualizzazione');
        });

        Schema::create('valorizzazioni_regola', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('regola_id');
            $table->uuid('hotel_id');
            $table->string('lingua', 5)->default('it')->comment('ISO 639-1');
            $table->text('testo')->nullable();
            $table->timestamps();

            $table->unique(['regola_id', 'hotel_id', 'lingua']);
            $table->foreign('regola_id')->references('id')->on('regole')->cascadeOnDelete();
            $table->foreign('hotel_id')->references('id')->on('hotels')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('valorizzazioni_regola');
        Schema::dropIfExists('regole');
    }
};
