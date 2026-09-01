<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chi ha prenotato può non essere chi dorme in camera (agenzia, partner,
 * genitore). L'export del gestionale li distingue: `nome`/`cognome` restano
 * l'ospite principale, `prenotante` è il nominativo di chi ha prenotato —
 * l'AI al chiosco cerca su entrambi.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('prenotazioni', function (Blueprint $table) {
            $table->string('prenotante')->nullable()->after('cognome');
        });
    }

    public function down(): void
    {
        Schema::table('prenotazioni', function (Blueprint $table) {
            $table->dropColumn('prenotante');
        });
    }
};
