<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('prenotazioni', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('hotel_id');
            $table->string('codice')->nullable()->comment('Codice esterno es. Booking.com');
            $table->date('check_in');
            $table->date('check_out');
            $table->json('pax')->comment('{"adulti":2,"ragazzi":0,"bambini":0}');
            $table->string('nome')->nullable();
            $table->string('cognome')->nullable();
            $table->string('gruppo')->nullable();
            $table->string('tipo_pagamento')->comment('gia_pagato | da_pagare');
            $table->string('documento_identita')->comment('gia_fornito | da_acquisire');
            $table->boolean('checkin_confermato')->default(false);
            $table->timestamp('checkin_confermato_at')->nullable();
            $table->decimal('prezzo', 8, 2)->nullable()->comment('Aggiornato manualmente dal receptionist');
            $table->boolean('overbooking')->default(false);
            $table->uuid('inserito_da')->nullable();
            $table->string('inserito_da_profilo')
                ->comment('Profilo utente che ha creato la prenotazione — determina regole cancellazione');
            $table->timestamps();

            $table->foreign('hotel_id')->references('id')->on('hotels')->cascadeOnDelete();
            $table->index(['hotel_id', 'check_in', 'check_out']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('prenotazioni');
    }
};
