<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('prenotazioni', function (Blueprint $table) {
            $table->string('codice_chiave')->nullable()->after('codice')
                  ->comment('Codice chiave camera consegnato all\'ospite');
        });
    }

    public function down(): void
    {
        Schema::table('prenotazioni', function (Blueprint $table) {
            $table->dropColumn('codice_chiave');
        });
    }
};
