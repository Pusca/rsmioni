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
        Schema::table('documenti', function (Blueprint $table) {
            $table->timestamp('visualizzato_at')->nullable()->after('inserito_da_profilo');
            $table->uuid('visualizzato_da')->nullable()->after('visualizzato_at');
        });
    }

    public function down(): void
    {
        Schema::table('documenti', function (Blueprint $table) {
            $table->dropColumn(['visualizzato_at', 'visualizzato_da']);
        });
    }
};
