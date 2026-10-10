<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Marketing\Appuntamento;
use App\Models\Marketing\Campagna;
use App\Models\Marketing\Lead;
use App\Models\User;
use App\Services\MarketingService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Modulo Marketing (docs/12): accesso per profilo, import JSON, calcolo KPI.
 */
class MarketingTest extends TestCase
{
    use RefreshDatabase;

    private function utente(Profilo $profilo): User
    {
        return User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => $profilo->value . '_' . Str::random(4),
            'email'        => Str::random(8) . '@test.rsmioni.it',
            'password'     => Hash::make('password'),
            'profilo'      => $profilo,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
    }

    public function test_gestore_hotel_vede_la_dashboard_marketing(): void
    {
        $this->artisan('marketing:importa')->assertSuccessful();

        $this->actingAs($this->utente(Profilo::GestoreHotel))
            ->get('/marketing')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Marketing/Index')
                ->has('kpi')
                ->has('funnel', 5)
                ->has('campagne')
                ->has('appuntamenti')
                ->has('eventi')
                ->where('meta.fonte_dati', 'import_manuale')
            );
    }

    public function test_admin_vede_la_dashboard_e_viene_rediretto_dalla_root(): void
    {
        $admin = $this->utente(Profilo::Admin);

        $this->actingAs($admin)->get('/marketing')->assertOk();
        $this->actingAs($admin)->get('/')->assertRedirect('/marketing');
    }

    public function test_receptionist_e_chiosco_non_accedono(): void
    {
        // Ospite (prima di actingAs: l'autenticazione resta attiva per tutto il test)
        $this->get('/marketing')->assertRedirect(route('login'));

        $this->actingAs($this->utente(Profilo::Receptionist))->get('/marketing')->assertForbidden();
        $this->actingAs($this->utente(Profilo::ReceptionistLite))->get('/marketing')->assertForbidden();
        $this->actingAs($this->utente(Profilo::Chiosco))->get('/marketing')->assertForbidden();
    }

    public function test_import_json_e_idempotente_e_rispetta_i_riferimenti(): void
    {
        $this->artisan('marketing:importa')->assertSuccessful();
        $campagne = Campagna::count();
        $lead     = Lead::count();

        // Secondo lancio: stessi codici → nessun duplicato
        $this->artisan('marketing:importa')->assertSuccessful();
        $this->assertSame($campagne, Campagna::count());
        $this->assertSame($lead, Lead::count());

        // Budget totale del file = 900 €
        $this->assertEquals(900.0, (float) Campagna::sum('budget'));

        // L'appuntamento spostato da Chip conserva l'orario originale
        $app = Appuntamento::where('codice', 'app-004')->firstOrFail();
        $this->assertTrue($app->spostato);
        $this->assertSame('2026-10-13 16:00', $app->inizio->format('Y-m-d H:i'));
        $this->assertSame('2026-10-11 10:30', $app->inizio_originale->format('Y-m-d H:i'));
        $this->assertSame('chip_whatsapp', $app->gestito_da);
    }

    public function test_kpi_distinguono_dato_mancante_da_zero(): void
    {
        Campagna::create(['codice' => 'a', 'nome' => 'A', 'piattaforma' => 'facebook', 'budget' => 100, 'speso' => null, 'impression' => null]);
        Campagna::create(['codice' => 'b', 'nome' => 'B', 'piattaforma' => 'google',   'budget' => 50,  'speso' => 20,   'impression' => 1000, 'click' => 25]);

        $kpi = app(MarketingService::class)->dashboard()['kpi'];

        $this->assertEquals(150.0, $kpi['budget']);
        $this->assertEquals(20.0, $kpi['speso']);          // la campagna senza spesa non azzera il totale
        $this->assertSame(1000, $kpi['impression']);
        $this->assertEquals(0.025, $kpi['ctr']);
        $this->assertNull($kpi['cpl']);                     // zero lead → nessun costo per lead
        $this->assertSame(0, $kpi['lead']);

        // Nessuna metrica caricata → tutto null, non 0
        Campagna::query()->update(['speso' => null, 'impression' => null, 'click' => null]);
        $kpi = app(MarketingService::class)->dashboard()['kpi'];
        $this->assertNull($kpi['speso']);
        $this->assertNull($kpi['impression']);
        $this->assertNull($kpi['ctr']);
    }

    public function test_funnel_conta_i_lead_con_appuntamento_valido(): void
    {
        $c = Campagna::create(['codice' => 'c', 'nome' => 'C', 'piattaforma' => 'instagram']);
        $l1 = Lead::create(['codice' => 'l1', 'campagna_id' => $c->id, 'struttura' => 'Hotel Uno', 'stato' => 'appuntamento', 'ricevuto_at' => '2026-10-01 10:00']);
        $l2 = Lead::create(['codice' => 'l2', 'campagna_id' => $c->id, 'struttura' => 'Hotel Due', 'stato' => 'cliente',      'ricevuto_at' => '2026-10-02 10:00']);
        Lead::create(['codice' => 'l3', 'campagna_id' => $c->id, 'struttura' => 'Hotel Tre', 'stato' => 'perso', 'ricevuto_at' => '2026-10-03 10:00']);

        Appuntamento::create(['codice' => 'a1', 'lead_id' => $l1->id, 'inizio' => '2026-10-20 10:00', 'stato' => 'programmato']);
        Appuntamento::create(['codice' => 'a2', 'lead_id' => $l1->id, 'inizio' => '2026-10-21 10:00', 'stato' => 'annullato']);
        Appuntamento::create(['codice' => 'a3', 'lead_id' => $l2->id, 'inizio' => '2026-10-05 10:00', 'stato' => 'completato']);

        $d = app(MarketingService::class)->dashboard();

        $this->assertSame(3, $d['kpi']['lead']);
        $this->assertSame(2, $d['kpi']['lead_attivi']);
        $this->assertSame(2, $d['kpi']['appuntamenti']);          // l'annullato non conta
        $this->assertSame(2, $d['kpi']['lead_con_appuntamento']);
        $this->assertSame(1, $d['kpi']['clienti']);
        $this->assertSame(3, $d['campagne'][0]['lead']);

        $funnel = collect($d['funnel'])->keyBy('chiave');
        $this->assertSame(3, $funnel['lead']['valore']);
        $this->assertSame(2, $funnel['appuntamenti']['valore']);
        $this->assertSame(1, $funnel['clienti']['valore']);
    }
}
