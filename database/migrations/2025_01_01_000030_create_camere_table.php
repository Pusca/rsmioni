<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('camere', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('hotel_id');
            $table->string('nome');
            $table->string('tipo');
            $table->unsignedTinyInteger('piano')->default(1);
            $table->boolean('booking_consentito')->default(true)
                ->comment('Se false non appare nella selezione camere delle prenotazioni');
            // Composizione letti
            $table->unsignedTinyInteger('letti_matrimoniali')->default(0);
            $table->unsignedTinyInteger('letti_singoli')->default(0);
            $table->unsignedTinyInteger('letti_aggiunti')->default(0);
            $table->unsignedTinyInteger('divani_letto_singoli')->default(0);
            $table->unsignedTinyInteger('divani_letto_matrimoniali')->default(0);
            $table->unsignedTinyInteger('culle')->default(0);
            // Dotazioni
            $table->boolean('doccia')->default(false);
            $table->boolean('vasca')->default(false);
            $table->boolean('minibar')->default(false);
            $table->boolean('minibar_pieno')->default(false);
            $table->boolean('aria_condizionata')->default(false);
            // Altre info
            $table->text('quadro_elettrico')->nullable();
            $table->string('codice_chiave')->nullable();
            $table->decimal('mq', 5, 2)->nullable();
            $table->timestamps();

            $table->foreign('hotel_id')->references('id')->on('hotels')->cascadeOnDelete();
        });

        Schema::create('prezzi_camera', function (Blueprint $table) {
            $table->id();
            $table->uuid('camera_id');
            $table->string('tipo_occupazione');
            $table->decimal('prezzo', 8, 2);
            $table->string('valuta', 3)->default('EUR');

            $table->foreign('camera_id')->references('id')->on('camere')->cascadeOnDelete();
        });

        // Pivot camera <-> prenotazione
        Schema::create('camera_prenotazione', function (Blueprint $table) {
            $table->uuid('camera_id');
            $table->uuid('prenotazione_id');
            $table->primary(['camera_id', 'prenotazione_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('camera_prenotazione');
        Schema::dropIfExists('prezzi_camera');
        Schema::dropIfExists('camere');
    }
};
