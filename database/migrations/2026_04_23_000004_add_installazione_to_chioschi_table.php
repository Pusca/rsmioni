<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chioschi', function (Blueprint $table) {
            $table->string('stato_installazione', 30)->default('da_installare')->after('ip_address');
            $table->text('note_installazione')->nullable()->after('stato_installazione');
            $table->json('checklist_installazione')->nullable()->after('note_installazione');
            $table->timestamp('installato_at')->nullable()->after('checklist_installazione');
        });
    }

    public function down(): void
    {
        Schema::table('chioschi', function (Blueprint $table) {
            $table->dropColumn(['stato_installazione', 'note_installazione', 'checklist_installazione', 'installato_at']);
        });
    }
};
