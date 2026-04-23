<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pagamenti', function (Blueprint $table) {
            $table->string('causale')->nullable()->after('valuta')
                ->comment('Descrizione/causale del pagamento (opzionale)');
        });
    }

    public function down(): void
    {
        Schema::table('pagamenti', function (Blueprint $table) {
            $table->dropColumn('causale');
        });
    }
};
