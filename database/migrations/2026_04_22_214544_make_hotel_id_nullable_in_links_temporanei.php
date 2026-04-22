<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('links_temporanei', function (Blueprint $table) {
            $table->uuid('hotel_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('links_temporanei', function (Blueprint $table) {
            $table->uuid('hotel_id')->nullable(false)->change();
        });
    }
};
