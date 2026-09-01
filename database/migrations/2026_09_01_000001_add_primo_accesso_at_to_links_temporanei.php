<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Link temporanei "quasi monouso": il primo accesso viene registrato e da
 * quel momento il link resta valido solo per una breve finestra di grazia
 * (ricarichi del viewer PDF, range request del browser), poi si chiude.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('links_temporanei', function (Blueprint $table) {
            $table->timestamp('primo_accesso_at')->nullable()->after('usato');
        });
    }

    public function down(): void
    {
        Schema::table('links_temporanei', function (Blueprint $table) {
            $table->dropColumn('primo_accesso_at');
        });
    }
};
