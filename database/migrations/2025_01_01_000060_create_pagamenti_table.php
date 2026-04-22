<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pagamenti', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('prenotazione_id');
            $table->uuid('chiosco_id');
            $table->decimal('importo_richiesto', 8, 2);
            $table->string('valuta', 3)->default('EUR');
            $table->string('esito')->default('pending')->comment('pending | ok | ko | no_file');
            $table->decimal('importo_effettivo', 8, 2)->nullable()->comment('Solo se esito OK');
            $table->string('tipo_pos')->comment('ingenico | mypos');
            $table->timestamp('data_operazione')->nullable()->comment('Data/ora dal POS');
            $table->uuid('eseguito_da');
            $table->timestamps();

            $table->foreign('prenotazione_id')->references('id')->on('prenotazioni')->cascadeOnDelete();
            $table->foreign('chiosco_id')->references('id')->on('chioschi');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pagamenti');
    }
};
