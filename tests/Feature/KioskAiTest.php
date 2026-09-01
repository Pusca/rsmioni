<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\User;
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
