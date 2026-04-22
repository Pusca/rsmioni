<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chioschi', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('hotel_id');
            $table->string('nome');
            $table->string('tipo')->default('touch')->comment('touch | analogico');
            $table->boolean('interattivo')->default(true)
                ->comment('Se false: solo visione nascosta (telecamera)');
            $table->boolean('has_pos')->default(false);
            $table->string('tipo_pos')->nullable()->comment('ingenico | mypos');
            $table->boolean('has_stampante')->default(false);
            $table->string('path_input_pos')->nullable()
                ->comment('Es. C:\\ProgramData\\RTSDoremiPos\\SRINPF.TXT');
            $table->string('path_output_pos')->nullable()
                ->comment('Es. C:\\ProgramData\\RTSDoremiPos\\SROUTF.TXT');
            $table->string('path_config_pos')->nullable();
            $table->string('path_log_pos')->nullable();
            $table->boolean('attivo')->default(true);
            $table->string('ip_address')->nullable()
                ->comment('IP del PC kiosk agent, per riferimento');
            $table->timestamps();

            $table->foreign('hotel_id')->references('id')->on('hotels')->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chioschi');
    }
};
