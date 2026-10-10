<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modulo Marketing — funnel campagne → lead → appuntamenti (docs/12-marketing-funnel.md).
 *
 * Dati a livello di piattaforma RS Mioni (non per hotel): raccontano come vanno
 * le campagne di acquisizione clienti e cosa fa Chip (automazione WhatsApp).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('marketing_campagne', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codice', 60)->unique();          // chiave stabile per l'import JSON
            $table->string('nome', 150);
            $table->string('piattaforma', 30);               // App\Enums\Marketing\Piattaforma
            $table->string('obiettivo', 150)->nullable();
            $table->string('stato', 20)->default('attiva');  // App\Enums\Marketing\StatoCampagna
            $table->decimal('budget', 10, 2)->nullable();
            $table->decimal('speso', 10, 2)->nullable();
            $table->unsignedInteger('impression')->nullable();
            $table->unsignedInteger('click')->nullable();
            $table->unsignedInteger('lead_dichiarati')->nullable(); // lead riportati dalla piattaforma ads
            $table->boolean('contenuti_ai')->default(false);        // creatività/testi generati con Chip
            $table->date('data_inizio')->nullable();
            $table->date('data_fine')->nullable();
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['piattaforma', 'stato']);
        });

        Schema::create('marketing_lead', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codice', 60)->unique();
            $table->foreignUuid('campagna_id')->nullable()->constrained('marketing_campagne')->nullOnDelete();
            $table->string('struttura', 150);                // nome hotel / struttura
            $table->string('referente', 150)->nullable();
            $table->string('citta', 100)->nullable();
            $table->string('telefono', 40)->nullable();
            $table->string('email', 150)->nullable();
            $table->string('fonte', 30)->nullable();         // piattaforma di provenienza (ridondante ma utile se la campagna manca)
            $table->string('stato', 20)->default('nuovo');   // App\Enums\Marketing\StatoLead
            $table->string('gestito_da', 20)->default('chip'); // chip | umano
            $table->dateTime('ricevuto_at');
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['stato', 'ricevuto_at']);
        });

        Schema::create('marketing_appuntamenti', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codice', 60)->unique();
            $table->foreignUuid('lead_id')->constrained('marketing_lead')->cascadeOnDelete();
            $table->dateTime('inizio');
            $table->dateTime('inizio_originale')->nullable(); // valorizzato se l'appuntamento è stato spostato
            $table->unsignedSmallInteger('durata_minuti')->default(30);
            $table->string('tipo', 20)->default('demo_online');     // demo_online | visita | chiamata
            $table->string('stato', 20)->default('programmato');    // App\Enums\Marketing\StatoAppuntamento
            $table->string('gestito_da', 30)->default('umano');     // chip_whatsapp | umano
            $table->text('note')->nullable();
            $table->timestamps();

            $table->index(['inizio', 'stato']);
        });

        Schema::create('marketing_eventi', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('codice', 60)->unique();
            $table->foreignUuid('lead_id')->nullable()->constrained('marketing_lead')->cascadeOnDelete();
            $table->foreignUuid('appuntamento_id')->nullable()->constrained('marketing_appuntamenti')->cascadeOnDelete();
            $table->string('tipo', 40);                      // lead_ricevuto | messaggio_whatsapp | appuntamento_fissato | appuntamento_spostato | ...
            $table->string('attore', 20)->default('chip');   // chip | umano | cliente
            $table->text('descrizione');
            $table->dateTime('avvenuto_at');
            $table->timestamps();

            $table->index('avvenuto_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('marketing_eventi');
        Schema::dropIfExists('marketing_appuntamenti');
        Schema::dropIfExists('marketing_lead');
        Schema::dropIfExists('marketing_campagne');
    }
};
