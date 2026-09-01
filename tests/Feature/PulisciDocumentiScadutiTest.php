<?php

namespace Tests\Feature;

use App\Models\Camera;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\Regola;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * `documenti:pulisci-scaduti` — retention dei documenti ospite.
 * Elimina solo i documenti di prenotazioni concluse da oltre N giorni;
 * non tocca mai regolamento e camere.
 */
class PulisciDocumentiScadutiTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');

        $this->hotel = Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Test',
            'indirizzo'                => 'Via Test 1',
            'chioschi_concorrenti_max' => 1,
            'checkout_libero'          => false,
            'checkout_ora'             => '10:00:00',
            'lingua_default'           => 'it',
            'lingue_abilitate'         => ['it'],
            'suoneria_attiva'          => true,
            'volume_suoneria'          => 80,
            'numero_massimo_pax'       => 4,
            'campi_pax_obbligatori'    => ['nome', 'cognome'],
        ]);
    }

    private function prenotazione(string $checkIn, string $checkOut): Prenotazione
    {
        return Prenotazione::create([
            'id'                  => Str::uuid()->toString(),
            'hotel_id'            => $this->hotel->id,
            'codice'              => 'T-' . Str::random(4),
            'check_in'            => $checkIn,
            'check_out'           => $checkOut,
            'pax'                 => ['adulti' => 1, 'ragazzi' => 0, 'bambini' => 0],
            'nome'                => 'Mario',
            'cognome'             => 'Rossi',
            'tipo_pagamento'      => 'da_pagare',
            'documento_identita'  => 'gia_fornito',
            'inserito_da_profilo' => 'receptionist',
        ]);
    }

    private function documento(string $contestoTipo, string $contestoId, int $giorniFa): Documento
    {
        $path = "documenti/{$contestoTipo}/{$contestoId}/" . Str::uuid() . '.jpg';
        Storage::disk('local')->put($path, 'img');

        $doc = Documento::create([
            'id'                  => Str::uuid()->toString(),
            'contesto_tipo'       => $contestoTipo,
            'contesto_id'         => $contestoId,
            'titolo'              => 'Doc',
            'estensione'          => 'jpg',
            'storage_path'        => $path,
            'inserito_da_profilo' => 'receptionist',
        ]);
        // created_at forzato nel passato
        Documento::where('id', $doc->id)->update(['created_at' => now()->subDays($giorniFa)]);

        return $doc->fresh();
    }

    public function test_elimina_solo_documenti_di_soggiorni_conclusi_oltre_la_retention(): void
    {
        $conclusa   = $this->prenotazione(now()->subDays(20)->toDateString(), now()->subDays(15)->toDateString());
        $recente    = $this->prenotazione(now()->subDays(10)->toDateString(), now()->subDays(3)->toDateString());
        $inCorso    = $this->prenotazione(now()->subDays(30)->toDateString(), now()->addDays(2)->toDateString());

        $docConclusa = $this->documento('prenotazione', $conclusa->id, 20);
        $docRecente  = $this->documento('prenotazione', $recente->id, 10);
        $docInCorso  = $this->documento('prenotazione', $inCorso->id, 30); // ospite ancora in casa: vecchio ma da tenere

        $this->artisan('documenti:pulisci-scaduti', ['--giorni' => 7])->assertSuccessful();

        $this->assertDatabaseMissing('documenti', ['id' => $docConclusa->id]);
        Storage::disk('local')->assertMissing($docConclusa->storage_path);

        $this->assertDatabaseHas('documenti', ['id' => $docRecente->id]);
        $this->assertDatabaseHas('documenti', ['id' => $docInCorso->id]);
    }

    public function test_non_tocca_mai_documenti_di_camere_e_regolamento(): void
    {
        $camera = Camera::create([
            'id'                 => Str::uuid()->toString(),
            'hotel_id'           => $this->hotel->id,
            'nome'               => '101',
            'tipo'               => 'Doppia',
            'piano'              => 1,
            'booking_consentito' => true,
            'letti_matrimoniali' => 1,
        ]);
        $regola = Regola::first() ?? Regola::create([
            'id' => Str::uuid()->toString(), 'codice' => 'test', 'categoria' => 'generale', 'ordine' => 1,
        ]);

        $docCamera = $this->documento('camera', $camera->id, 400);
        $docRegola = $this->documento('regola', $regola->id, 400);

        $this->artisan('documenti:pulisci-scaduti', ['--giorni' => 7])->assertSuccessful();

        $this->assertDatabaseHas('documenti', ['id' => $docCamera->id]);
        $this->assertDatabaseHas('documenti', ['id' => $docRegola->id]);
    }

    public function test_documento_orfano_vecchio_viene_eliminato(): void
    {
        $orfano = $this->documento('prenotazione', Str::uuid()->toString(), 30);

        $this->artisan('documenti:pulisci-scaduti')->assertSuccessful();

        $this->assertDatabaseMissing('documenti', ['id' => $orfano->id]);
    }

    public function test_dry_run_non_elimina_nulla(): void
    {
        $conclusa = $this->prenotazione(now()->subDays(20)->toDateString(), now()->subDays(15)->toDateString());
        $doc      = $this->documento('prenotazione', $conclusa->id, 20);

        $this->artisan('documenti:pulisci-scaduti', ['--dry-run' => true])
            ->expectsOutputToContain('Da eliminare: 1')
            ->assertSuccessful();

        $this->assertDatabaseHas('documenti', ['id' => $doc->id]);
        Storage::disk('local')->assertExists($doc->storage_path);
    }
}
