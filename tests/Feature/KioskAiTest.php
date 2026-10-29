<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\Regola;
use App\Models\User;
use App\Models\ValorizzazioneRegola;
use App\Services\LiveKitDispatchService;
use App\Services\PortineriaService;
use App\Services\WebRtcSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Avvio del self check-in AI dal chiosco: stati di partenza ammessi, in
 * particolare la ripartenza da una sessione AI rimasta appesa (agent caduto
 * o chiosco scollegato) che non deve bloccare il chiosco.
 */
class KioskAiTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private Chiosco $chiosco;
    private User $account;

    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();

        // LiveKit non è configurato nei test: il dispatch dell'agent è un no-op
        $this->mock(LiveKitDispatchService::class, fn ($m) => $m->shouldReceive('dispatch')->andReturnNull());

        $this->hotel = Hotel::create([
            'id' => Str::uuid()->toString(), 'nome' => 'Hotel Test', 'indirizzo' => 'Via Test 1',
            'chioschi_concorrenti_max' => 1, 'checkout_libero' => false, 'checkout_ora' => '10:00:00',
            'lingua_default' => 'it', 'lingue_abilitate' => ['it'], 'suoneria_attiva' => true,
            'volume_suoneria' => 80, 'numero_massimo_pax' => 4, 'campi_pax_obbligatori' => ['nome', 'cognome'],
        ]);
        $this->chiosco = Chiosco::create([
            'id' => Str::uuid()->toString(), 'hotel_id' => $this->hotel->id, 'nome' => 'Chiosco Test',
            'tipo' => 'touch', 'interattivo' => true, 'has_pos' => false, 'has_stampante' => false, 'attivo' => true,
        ]);
        $this->account = User::create([
            'id' => Str::uuid()->toString(), 'username' => 'chiosco_t', 'email' => 'c@test.local',
            'password' => Hash::make('password'), 'profilo' => Profilo::Chiosco, 'ip_whitelist' => [], 'attivo' => true,
        ]);
        $this->account->hotels()->attach($this->hotel->id);
    }

    private function avvia()
    {
        return $this->actingAs($this->account)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/ai/avvia', ['scopo' => 'checkin']);
    }

    public function test_il_poll_del_chiosco_tiene_vivo_lo_stato_anche_senza_sessione(): void
    {
        $portineria = app(PortineriaService::class);
        $portineria->impostaStato($this->chiosco, StatoChiosco::Idle);

        // Senza poll lo stato scade dopo 5 minuti → Offline
        $this->travel(4)->minutes();
        $this->actingAs($this->account)->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/livekit/token'); // LiveKit non configurato nei test: 503, ma il rinnovo avviene prima
        $this->travel(4)->minutes();
        $this->assertSame(StatoChiosco::Idle, $portineria->statoChiosco($this->chiosco->id), 'il poll del token rinnova lo stato');

        $this->travel(4)->minutes();
        $this->actingAs($this->account)->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/stato')->assertOk()->assertJsonPath('stato', 'idle');
        $this->travel(4)->minutes();
        $this->assertSame(StatoChiosco::Idle, $portineria->statoChiosco($this->chiosco->id), 'il poll dello stato rinnova lo stato');

        // Scaduto davvero → il primo poll lo riporta a Idle
        $this->travel(6)->minutes();
        $this->assertSame(StatoChiosco::Offline, $portineria->statoChiosco($this->chiosco->id));
        $this->actingAs($this->account)->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/stato')->assertJsonPath('stato', 'idle');
    }

    public function test_la_lingua_scelta_sul_chiosco_arriva_all_agent_se_abilitata(): void
    {
        $this->hotel->update(['lingue_abilitate' => ['it', 'en', 'de']]);
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);

        $metadata = [];
        $this->mock(LiveKitDispatchService::class, function ($m) use (&$metadata) {
            $m->shouldReceive('dispatch')->andReturnUsing(function ($room, $meta) use (&$metadata) { $metadata[] = $meta; });
        });

        $this->actingAs($this->account)->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/ai/avvia', ['scopo' => 'checkin', 'lingua' => 'en'])
            ->assertOk()->assertJsonPath('lingua', 'en');
        $this->assertSame('en', $metadata[0]['lingua']);

        // Lingua non abilitata → default dell'hotel
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);
        $this->actingAs($this->account)->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/ai/avvia', ['scopo' => 'checkin', 'lingua' => 'fr'])
            ->assertOk()->assertJsonPath('lingua', 'it');
        $this->assertSame('it', $metadata[1]['lingua']);
    }

    public function test_il_regolamento_valorizzato_arriva_all_agent_nella_lingua_giusta(): void
    {
        $this->hotel->update(['lingue_abilitate' => ['it', 'en'], 'istruzioni_ai' => 'Colazione: dalle 7 alle 10']);
        $animali    = Regola::create(['codice' => 'POLITICA_ANIMALI', 'categoria' => 'generale', 'ordine' => 80]);
        $parcheggio = Regola::create(['codice' => 'PARCHEGGIO', 'categoria' => 'generale', 'ordine' => 100]);
        $vuota      = Regola::create(['codice' => 'WIFI_CREDENZIALI', 'categoria' => 'generale', 'ordine' => 60]);
        ValorizzazioneRegola::create(['regola_id' => $animali->id, 'hotel_id' => $this->hotel->id, 'lingua' => 'it', 'testo' => "Animali ammessi di piccola taglia.\r\nSupplemento 15 euro a notte."]);
        ValorizzazioneRegola::create(['regola_id' => $animali->id, 'hotel_id' => $this->hotel->id, 'lingua' => 'en', 'testo' => 'Small pets welcome, 15 euro per night.']);
        ValorizzazioneRegola::create(['regola_id' => $parcheggio->id, 'hotel_id' => $this->hotel->id, 'lingua' => 'it', 'testo' => "Parcheggio gratuito dietro l'hotel."]);
        ValorizzazioneRegola::create(['regola_id' => $vuota->id, 'hotel_id' => $this->hotel->id, 'lingua' => 'it', 'testo' => '  ']);
        // Regola di un altro hotel: non deve comparire
        $altro = Hotel::create([
            'id' => Str::uuid()->toString(), 'nome' => 'Altro', 'indirizzo' => 'Via Altra 2',
            'chioschi_concorrenti_max' => 1, 'checkout_libero' => true, 'lingua_default' => 'it', 'lingue_abilitate' => ['it'],
            'suoneria_attiva' => true, 'volume_suoneria' => 80, 'numero_massimo_pax' => 4, 'campi_pax_obbligatori' => [],
        ]);
        ValorizzazioneRegola::create(['regola_id' => $parcheggio->id, 'hotel_id' => $altro->id, 'lingua' => 'it', 'testo' => 'Garage a pagamento.']);
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);

        $metadata = [];
        $this->mock(LiveKitDispatchService::class, function ($m) use (&$metadata) {
            $m->shouldReceive('dispatch')->andReturnUsing(function ($room, $meta) use (&$metadata) { $metadata[] = $meta; });
        });

        $this->avvia()->assertOk();
        $testo = $metadata[0]['regolamento_hotel'];
        $this->assertSame('Colazione: dalle 7 alle 10', $metadata[0]['istruzioni_hotel']);
        $this->assertTrue($metadata[0]['documento_verifica'], 'hotel reale: il documento si legge e si verifica');
        $this->assertStringContainsString("Politica Animali:\nAnimali ammessi di piccola taglia.\nSupplemento 15 euro a notte.", $testo);
        $this->assertStringContainsString("Parcheggio:\nParcheggio gratuito dietro l'hotel.", $testo);
        $this->assertStringNotContainsString('Wifi Credenziali', $testo, 'le regole vuote non compaiono');
        $this->assertStringNotContainsString('Garage', $testo, 'regole di un altro hotel escluse');
        $this->assertStringNotContainsString('Small pets', $testo, 'in italiano si usa il testo italiano');

        // In inglese si preferisce la valorizzazione inglese, con l'italiano di riserva
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);
        $this->actingAs($this->account)->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/ai/avvia', ['scopo' => 'info', 'lingua' => 'en'])->assertOk();
        $this->assertStringContainsString("Politica Animali:\nSmall pets welcome", $metadata[1]['regolamento_hotel']);
        $this->assertStringContainsString('Parcheggio gratuito', $metadata[1]['regolamento_hotel']);

        // Hotel senza regole valorizzate: niente blocco
        ValorizzazioneRegola::where('hotel_id', $this->hotel->id)->delete();
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);
        $this->avvia()->assertOk();
        $this->assertNull($metadata[2]['regolamento_hotel']);
    }

    public function test_sull_hotel_demo_il_documento_si_accetta_senza_verifica(): void
    {
        $this->hotel->update(['demo' => true]);
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);
        $metadata = [];
        $this->mock(LiveKitDispatchService::class, function ($m) use (&$metadata) {
            $m->shouldReceive('dispatch')->andReturnUsing(function ($room, $meta) use (&$metadata) { $metadata[] = $meta; });
        });

        $this->avvia()->assertOk();
        $this->assertFalse($metadata[0]['documento_verifica']);
    }

    public function test_da_idle_parte_e_porta_il_chiosco_in_parlato(): void
    {
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);

        $this->avvia()->assertOk()->assertJsonPath('ok', true);

        $this->assertSame(StatoChiosco::InParlato, app(PortineriaService::class)->statoChiosco($this->chiosco->id));
        $sid = app(WebRtcSessionService::class)->sessioneAttivaPerChiosco($this->chiosco->id);
        $this->assertSame('ai', app(WebRtcSessionService::class)->trova($sid)['gestita_da']);
    }

    public function test_riparte_da_una_sessione_ai_rimasta_appesa(): void
    {
        $sessioni = app(WebRtcSessionService::class);
        $vecchia  = $sessioni->crea($this->account->id, $this->chiosco->id, $this->hotel->id, 'parlato', 'ai');
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::InParlato);

        $r = $this->avvia()->assertOk();

        $this->assertNotSame($vecchia, $r->json('session_id'));
        $this->assertNull($sessioni->trova($vecchia), 'la sessione appesa va chiusa');
    }

    public function test_non_interrompe_un_parlato_umano(): void
    {
        $receptionist = User::create([
            'id' => Str::uuid()->toString(), 'username' => 'rec_t', 'email' => 'r@test.local',
            'password' => Hash::make('password'), 'profilo' => Profilo::Receptionist, 'ip_whitelist' => [], 'attivo' => true,
        ]);
        app(WebRtcSessionService::class)->crea($receptionist->id, $this->chiosco->id, $this->hotel->id, 'parlato', 'umano');
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::InParlato);

        $this->avvia()->assertStatus(422);
    }
}
