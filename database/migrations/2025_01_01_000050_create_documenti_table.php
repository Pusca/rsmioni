<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('documenti', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('contesto_tipo')->comment('prenotazione | camera | regola');
            $table->uuid('contesto_id')->comment('FK polimorfica: prenotazione/camera/regola');
            $table->string('titolo')->nullable();
            $table->string('lingua', 5)->nullable()->comment('ISO 639-1: it, en, fr, ...');
            $table->string('tipo_documento')->nullable()->comment('Es. carta_identita, planimetria, foto');
            $table->string('estensione', 10)->comment('pdf | png | jpg | jpeg');
            $table->string('storage_path')->comment('Path nel disco storage Laravel');
            $table->uuid('inserito_da')->nullable();
            $table->string('inserito_da_profilo')->comment('Per regole cancellazione');
            $table->timestamps();

            $table->index(['contesto_tipo', 'contesto_id']);
        });

        Schema::create('links_temporanei', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('documento_id');
            $table->string('token', 64)->unique()->comment('UUID random, usato nell URL pubblico');
            $table->string('destinatario_email');
            $table->text('testo_receptionist')->nullable();
            $table->uuid('hotel_id')->comment('Usato come oggetto email');
            $table->timestamp('scadenza_at');
            $table->boolean('usato')->default(false);
            $table->timestamps();

            $table->foreign('documento_id')->references('id')->on('documenti')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('links_temporanei');
        Schema::dropIfExists('documenti');
    }
};
