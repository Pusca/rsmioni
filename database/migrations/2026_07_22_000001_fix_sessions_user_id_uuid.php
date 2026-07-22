<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * La tabella sessions nasce dallo skeleton Laravel con user_id BIGINT
 * (foreignId), ma gli utenti usano chiavi UUID (HasUuids): su MySQL strict
 * la scrittura della sessione autenticata fallisce e il login non persiste.
 * Su SQLite il problema non emerge per la tipizzazione dinamica.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sessions', function (Blueprint $table) {
            $table->uuid('user_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('sessions', function (Blueprint $table) {
            $table->unsignedBigInteger('user_id')->nullable()->change();
        });
    }
};
