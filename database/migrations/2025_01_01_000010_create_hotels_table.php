<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hotels', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('nome');
            $table->string('indirizzo')->nullable();
            $table->date('data_inizio_contratto')->nullable();
            $table->date('data_fine_contratto')->nullable();
            $table->unsignedSmallInteger('giorni_visibilita_calendario')->default(30)
                ->comment('Max giorni futuri visibili al receptionist');
            $table->boolean('overbooking_permesso')->default(false);
            $table->boolean('delega_rs_mioni')->default(false)
                ->comment('Se RS Mioni gestisce FAQ/camere/prenotazioni per conto albergatore');
            $table->unsignedSmallInteger('giorni_cancellazione_automatica')->nullable()
                ->comment('Giorni dopo check-out per auto-cancellazione prenotazioni');
            $table->unsignedTinyInteger('chioschi_concorrenti_max')->default(1)
                ->comment('N = chiaro + nascosti + parlato <= questo valore');

            // Configurazione checkout
            $table->boolean('checkout_libero')->default(true)
                ->comment('Se false, usa checkout_ora');
            $table->time('checkout_ora')->nullable()
                ->comment('Ora fissa check-out se checkout_libero=false');

            // Localizzazione
            $table->string('lingua_default', 5)->default('it');
            $table->json('lingue_abilitate')->nullable()
                ->comment('Array ISO 639-1 lingue attive sul chiosco');

            // Branding
            $table->string('logo_path')->nullable();
            $table->string('sfondo_kiosk_path')->nullable();

            // Audio
            $table->boolean('suoneria_attiva')->default(true);
            $table->unsignedTinyInteger('volume_suoneria')->default(80);

            // Configurazione pax
            $table->unsignedTinyInteger('numero_massimo_pax')->default(4);
            $table->json('campi_pax_obbligatori')->nullable()
                ->comment('Array di campi obbligatori per ogni pax');

            $table->timestamps();
        });

        Schema::create('turni_orario', function (Blueprint $table) {
            $table->id();
            $table->uuid('hotel_id');
            $table->time('ora_inizio');
            $table->time('ora_fine');
            $table->foreign('hotel_id')->references('id')->on('hotels')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('turni_orario');
        Schema::dropIfExists('hotels');
    }
};
