<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Impostazioni del receptionist AI per hotel (docs/11):
 *  - ai_walkin_abilitato: se false l'AI fa il check-in SOLO su prenotazioni
 *    già presenti (importate dal gestionale) e non ne crea di nuove — evita
 *    la doppia vendita quando il master delle prenotazioni è un altro PMS.
 *  - istruzioni_ai: informazioni dell'hotel che l'AI può usare a voce
 *    (colazione, Wi-Fi, chiavi, come raggiungere la dépendance...).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('hotels', function (Blueprint $table) {
            $table->boolean('ai_walkin_abilitato')->default(true)->after('numero_massimo_pax');
            $table->text('istruzioni_ai')->nullable()->after('ai_walkin_abilitato');
        });
    }

    public function down(): void
    {
        Schema::table('hotels', function (Blueprint $table) {
            $table->dropColumn(['ai_walkin_abilitato', 'istruzioni_ai']);
        });
    }
};
