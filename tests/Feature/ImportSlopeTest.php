<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Enums\TipoPagamento;
use App\Models\Camera;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use App\Services\SlopeImportService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Ponte Slope → rsMioni: import dell'export CSV dell'elenco prenotazioni.
 * Il CSV di test replica le colonne visibili in Slope → Prenotazioni → Elenco.
 */
class ImportSlopeTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private User $gestore;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hotel = Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Villa Test',
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

        foreach (['101', '102', '103'] as $n) {
            Camera::create([
                'id' => Str::uuid()->toString(), 'hotel_id' => $this->hotel->id, 'nome' => $n,
                'tipo' => 'Camera Economy', 'piano' => 0, 'booking_consentito' => true, 'letti_matrimoniali' => 1,
            ]);
        }

        $this->gestore = User::create([
            'id' => Str::uuid()->toString(), 'username' => 'gest_' . Str::random(6), 'email' => Str::random(8) . '@t.local',
            'password' => Hash::make('password'), 'profilo' => Profilo::GestoreHotel, 'ip_whitelist' => [], 'attivo' => true,
        ]);
        $this->gestore->hotels()->attach($this->hotel->id);
    }

    private function csv(): string
    {
        return implode("\n", [
            'NUMERO;DATA PRENOTAZIONE;PRENOTANTE;OSPITE PRINCIPALE;CANALE;AGENZIA;ALLOGGIO;PERIODO;STATO',
            '#7725229;31/08/2026;Mario Rossi;Luca Bianchi;Backoffice;VILLA;Camera Economy 102;05/09/2026 - 07/09/2026 (2 notti);Atteso arrivo',
            '#6335361;03/03/2026;Anna Verdi;-;Channel manager;Booking.com (5331795779);Camera Economy 101;05/09/2026 - 06/09/2026 (1 notte);Atteso arrivo',
            '#6335361;03/03/2026;Anna Verdi;-;Channel manager;Booking.com (5331795779);Camera Economy 103;05/09/2026 - 06/09/2026 (1 notte);Atteso arrivo',
            '#7033931;07/06/2026;Piero Neri;-;Channel manager;Booking.com;Camera Economy 102;05/09/2026 - 09/09/2026 (4 notti);Cancellata',
            '#7710712;29/08/2026;Gina Gialli;-;Backoffice;-;Camera Suite 999;06/09/2026 - 08/09/2026 (2 notti);Atteso arrivo',
        ]);
    }

    public function test_importa_crea_prenotazioni_con_camere_e_salta_le_cancellate(): void
    {
        $report = app(SlopeImportService::class)->importaCsv($this->csv(), $this->hotel, $this->gestore);

        $this->assertSame(3, $report->create);
        $this->assertSame(1, $report->cancellate);
        $this->assertSame(0, $report->saltate);

        // Singola: ospite principale prevale sul prenotante, camera 102
        $p1 = Prenotazione::where('codice', '7725229')->firstOrFail();
        $this->assertSame('Luca', $p1->nome);
        $this->assertSame('Bianchi', $p1->cognome);
        $this->assertSame('2026-09-05', $p1->check_in->toDateString());
        $this->assertSame('2026-09-07', $p1->check_out->toDateString());
        $this->assertSame(['102'], $p1->camere->pluck('nome')->all());
        $this->assertSame(TipoPagamento::DaPagare, $p1->tipo_pagamento);
        $this->assertSame(Profilo::GestoreHotel, $p1->inserito_da_profilo);

        // Due righe stesso numero → una prenotazione con due camere
        $p2 = Prenotazione::where('codice', '6335361')->firstOrFail();
        $this->assertEqualsCanonicalizing(['101', '103'], $p2->camere->pluck('nome')->all());
        $this->assertSame('Anna', $p2->nome);

        // Camera sconosciuta → prenotazione creata senza camera + avviso
        $p3 = Prenotazione::where('codice', '7710712')->firstOrFail();
        $this->assertCount(0, $p3->camere);
        $this->assertTrue(collect($report->avvisi)->contains(fn ($a) => str_contains($a, '999')));

        // Nessun pax nel file → avviso una sola volta
        $this->assertSame(1, collect($report->avvisi)->filter(fn ($a) => str_contains($a, 'numero di ospiti'))->count());
        $this->assertSame(1, $p1->pax['adulti']);
    }

    public function test_reimport_aggiorna_senza_duplicare_e_rispetta_il_checkin_confermato(): void
    {
        $svc = app(SlopeImportService::class);
        $svc->importaCsv($this->csv(), $this->hotel, $this->gestore);

        Prenotazione::where('codice', '6335361')->update(['checkin_confermato' => true]);

        // Slope sposta la 7725229 sulla 103 e cambia le date
        $csv2 = implode("\n", [
            'NUMERO;PRENOTANTE;OSPITE PRINCIPALE;ALLOGGIO;PERIODO;STATO',
            '#7725229;Mario Rossi;Luca Bianchi;Camera Economy 103;06/09/2026 - 08/09/2026 (2 notti);Atteso arrivo',
            '#6335361;Anna Verdi;-;Camera Economy 101;10/09/2026 - 11/09/2026 (1 notte);Atteso arrivo',
        ]);
        $report = $svc->importaCsv($csv2, $this->hotel, $this->gestore);

        $this->assertSame(0, $report->create);
        $this->assertSame(1, $report->aggiornate);
        $this->assertSame(1, $report->confermate);
        $this->assertSame(3, Prenotazione::count());

        $p1 = Prenotazione::where('codice', '7725229')->firstOrFail();
        $this->assertSame(['103'], $p1->camere->pluck('nome')->all());
        $this->assertSame('2026-09-06', $p1->check_in->toDateString());

        // La confermata non è stata toccata
        $p2 = Prenotazione::where('codice', '6335361')->firstOrFail();
        $this->assertSame('2026-09-05', $p2->check_in->toDateString());
    }

    public function test_conflitto_con_prenotazione_locale_marca_overbooking_e_assegna_comunque(): void
    {
        // Prenotazione manuale in rsMioni sulla 102 nelle stesse date
        $locale = Prenotazione::create([
            'id' => Str::uuid()->toString(), 'hotel_id' => $this->hotel->id, 'codice' => 'MAN-1',
            'check_in' => '2026-09-05', 'check_out' => '2026-09-07', 'pax' => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
            'nome' => 'A', 'cognome' => 'B', 'tipo_pagamento' => 'da_pagare', 'documento_identita' => 'da_acquisire',
            'inserito_da_profilo' => 'gestore_hotel',
        ]);
        $locale->camere()->attach(Camera::where('nome', '102')->first()->id);

        $report = app(SlopeImportService::class)->importaCsv($this->csv(), $this->hotel, $this->gestore);

        $p1 = Prenotazione::where('codice', '7725229')->firstOrFail();
        $this->assertTrue($p1->overbooking);
        $this->assertSame(['102'], $p1->camere->pluck('nome')->all());
        $this->assertTrue(collect($report->avvisi)->contains(fn ($a) => str_contains($a, 'doppia occupazione')));
    }

    public function test_riconosce_colonne_separate_virgola_e_date_iso(): void
    {
        $csv = "\xEF\xBB\xBFid,nome,cognome,camera,check_in,check_out,adulti,bambini,saldo\n"
             . "9001,Elena,Rossi,101,2026-09-12,2026-09-14,2,1,\"0,00 €\"\n";

        $report = app(SlopeImportService::class)->importaCsv($csv, $this->hotel, $this->gestore);

        $this->assertSame(1, $report->create);
        $p = Prenotazione::where('codice', '9001')->firstOrFail();
        $this->assertSame('Elena', $p->nome);
        $this->assertSame(['adulti' => 2, 'ragazzi' => 0, 'bambini' => 1], $p->pax);
        $this->assertSame(TipoPagamento::GiaPagato, $p->tipo_pagamento);
        $this->assertSame(['101'], $p->camere->pluck('nome')->all());
    }

    public function test_dry_run_non_scrive(): void
    {
        $report = app(SlopeImportService::class)->importaCsv($this->csv(), $this->hotel, $this->gestore, dryRun: true);

        $this->assertSame(3, $report->create);
        $this->assertSame(0, Prenotazione::count());
    }

    public function test_upload_dal_gestore_importa_e_mostra_il_riepilogo(): void
    {
        $file = UploadedFile::fake()->createWithContent('slope.csv', $this->csv());

        $this->actingAs($this->gestore)
            ->post('/prenotazioni/importa-slope', ['file' => $file])
            ->assertRedirect(route('prenotazioni.index'))
            ->assertSessionHas('success')
            ->assertSessionHas('import_avvisi');

        $this->assertSame(3, Prenotazione::count());
    }

    public function test_receptionist_non_puo_importare(): void
    {
        $r = User::create([
            'id' => Str::uuid()->toString(), 'username' => 'rec_' . Str::random(6), 'email' => Str::random(8) . '@t.local',
            'password' => Hash::make('password'), 'profilo' => Profilo::Receptionist, 'ip_whitelist' => [], 'attivo' => true,
        ]);
        $r->hotels()->attach($this->hotel->id);

        $this->actingAs($r)
            ->post('/prenotazioni/importa-slope', ['file' => UploadedFile::fake()->createWithContent('s.csv', $this->csv())])
            ->assertForbidden();
    }

    public function test_comando_artisan_importa_il_file(): void
    {
        $path = storage_path('app/slope-test.csv');
        file_put_contents($path, $this->csv());

        try {
            $this->artisan('prenotazioni:importa-slope', ['file' => $path])
                ->expectsOutputToContain('3 nuove')
                ->assertSuccessful();
        } finally {
            @unlink($path);
        }

        $this->assertSame(3, Prenotazione::count());
    }
}
