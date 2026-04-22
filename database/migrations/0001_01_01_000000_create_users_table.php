<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('username')->unique();
            $table->string('email')->unique();
            $table->string('password');
            $table->string('profilo'); // App\Enums\Profilo
            $table->json('ip_whitelist')->nullable()->comment('Lista IP statici; null = nessun filtro');
            $table->boolean('attivo')->default(true);
            $table->rememberToken();
            $table->timestamps();
        });

        // Pivot hotel <-> utente
        Schema::create('hotel_user', function (Blueprint $table) {
            $table->uuid('hotel_id');
            $table->uuid('user_id');
            $table->primary(['hotel_id', 'user_id']);
        });

        Schema::create('sessions', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->foreignId('user_id')->nullable()->index();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->longText('payload');
            $table->integer('last_activity')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hotel_user');
        Schema::dropIfExists('sessions');
        Schema::dropIfExists('users');
    }
};
