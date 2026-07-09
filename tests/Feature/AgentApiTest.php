<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Camera;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use App\Services\WebRtcSessionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * API di dominio del receptionist AI (/agent/*) — docs/09 FASE 2.
 *
 * Copre: autenticazione service, validazione del form vocale, creazione
 * della prenotazione reale, assegnazione camera per capienza, flusso
 * acquisizione documento e chiusura sessione.
 */
class AgentApiTest extends TestCase
{
    use RefreshDatabase;

    private const TOKEN = 'token-di-test';

    private Hotel $hotel;
    private Chiosco $chiosco;
    private User $accountChiosco;
    private string $sessionId;

    protected function setUp(): void
    {
        parent::setUp();

        config(['services.agent.token' => self::TOKEN]);

        $this->hotel = Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Test',
            'indirizzo'                => 'Via Test 1',
            'chioschi_concorrenti_max' => 3,
            'checkout_libero'          => false,
            'checkout_ora'             => '10:00:00',
            'lingua_default'           => 'it',
            'lingue_abilitate'         => ['it'],
            'suoneria_attiva'          => true,
            'volume_suoneria'          => 80,
            'numero_massimo_pax'       => 4,
            'campi_pax_obbligatori'    => ['nome', 'cognome'],
        ]);

        $this->chiosco = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->hotel->id,
            'nome'          => 'Chiosco Test',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);

        $this->accountChiosco = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'chiosco_test',
            'email'        => 'chiosco@test.local',
            'password'     => Hash::make('password'),
            'profilo'      => Profilo::Chiosco,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);

        $this->sessionId = app(WebRtcSessionService::class)->crea(
            receptionistId: $this->accountChiosco->id,
            chioscoId:      $this->chiosco->id,
            hotelId:        $this->hotel->id,
            tipo:           'parlato',
            gestitaDa:      'ai',
        );
    }

    /** Chiamata all'API agent con il token di servizio. */
    private function agentPost(string $uri, array $payload = [])
    {
        return $this->postJson($uri, ['session_id' => $this->sessionId, ...$payload], [
            'X-Agent-Token' => self::TOKEN,
        ]);
    }

    private function camera(string $nome, int $singoli = 0, int $matrimoniali = 0): Camera
    {
        return Camera::create([
            'id'                 => Str::uuid()->toString(),
            'hotel_id'           => $this->hotel->id,
            'nome'               => $nome,
            'tipo'               => 'Test',
            'piano'              => 1,
            'booking_consentito' => true,
            'letti_singoli'      => $singoli,
            'letti_matrimoniali' => $matrimoniali,
        ]);
    }

    // ── Autenticazione ─────────────────────────────────────────────────────

    public function test_rifiuta_richieste_senza_token(): void
    {
        $this->postJson('/agent/form', ['session_id' => $this->sessionId])
            ->assertStatus(401);
    }

    public function test_rifiuta_sessione_inesistente(): void
    {
        $this->postJson('/agent/form', ['session_id' => 'non-esiste'], ['X-Agent-Token' => self::TOKEN])
            ->assertStatus(404);
    }

    public function test_rifiuta_sessione_non_gestita_da_ai(): void
    {
        $sidUmano = app(WebRtcSessionService::class)->crea(
            $this->accountChiosco->id, $this->chiosco->id, $this->hotel->id, 'parlato', 'umano',
        );

        $this->postJson('/agent/form', ['session_id' => $sidUmano], ['X-Agent-Token' => self::TOKEN])
            ->assertStatus(404);
    }

    // ── Form vocale ────────────────────────────────────────────────────────

    public function test_registra_i_campi_del_form_incrementalmente(): void
    {
        $this->agentPost('/agent/form', ['nome' => 'Mario', 'cognome' => 'Rossi'])->assertOk();

        $this->agentPost('/agent/form', ['check_in' => now()->toDateString()])
            ->assertOk()
            ->assertJsonPath('form.nome', 'Mario')
            ->assertJsonPath('form.check_in', now()->toDateString());
    }

    public function test_rifiuta_check_in_nel_passato(): void
    {
        $this->agentPost('/agent/form', ['check_in' => now()->subDays(2)->toDateString()])
            ->assertStatus(422);
    }

    public function test_rifiuta_partenza_non_successiva_all_arrivo(): void
    {
        $this->agentPost('/agent/form', [
            'check_in'  => now()->addDay()->toDateString(),
            'check_out' => now()->toDateString(),
        ])->assertStatus(422);
    }

    // ── Prenotazione ───────────────────────────────────────────────────────

    public function test_prenotazione_rifiutata_se_mancano_dati(): void
    {
        $this->agentPost('/agent/form', ['nome' => 'Mario']);

        $this->agentPost('/agent/prenotazione')
            ->assertStatus(422)
            ->assertJsonStructure(['mancanti']);
    }

    public function test_prenotazione_creata_con_form_completo(): void
    {
        $this->agentPost('/agent/form', [
            'nome' => 'Mario', 'cognome' => 'Rossi',
            'check_in'  => now()->toDateString(),
            'check_out' => now()->addDays(2)->toDateString(),
            'adulti'    => 2,
        ]);

        $risposta = $this->agentPost('/agent/prenotazione')->assertOk();

        $this->assertDatabaseHas('prenotazioni', [
            'hotel_id' => $this->hotel->id,
            'cognome'  => 'Rossi',
            'codice'   => $risposta->json('codice'),
        ]);
        $this->assertStringStartsWith('AI-', $risposta->json('codice'));

        // Idempotente: un retry NON crea una seconda prenotazione
        $this->agentPost('/agent/prenotazione')
            ->assertOk()
            ->assertJsonPath('codice', $risposta->json('codice'));
        $this->assertSame(1, Prenotazione::count());
    }

    // ── Camera ─────────────────────────────────────────────────────────────

    public function test_camera_rifiutata_senza_prenotazione(): void
    {
        $this->agentPost('/agent/camera')->assertStatus(422);
    }

    public function test_camera_scelta_per_capienza(): void
    {
        $this->camera('Singola-01', singoli: 1);
        $doppia = $this->camera('Doppia-02', matrimoniali: 1);

        $this->agentPost('/agent/form', [
            'nome' => 'Mario', 'cognome' => 'Rossi',
            'check_in'  => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
            'adulti'    => 2,
        ]);
        $this->agentPost('/agent/prenotazione')->assertOk();

        // 2 adulti → deve saltare la singola e scegliere la doppia
        $this->agentPost('/agent/camera')
            ->assertOk()
            ->assertJsonPath('camera.nome', $doppia->nome);
    }

    public function test_camera_errore_se_nessuna_disponibile(): void
    {
        $this->agentPost('/agent/form', [
            'nome' => 'Mario', 'cognome' => 'Rossi',
            'check_in'  => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
        ]);
        $this->agentPost('/agent/prenotazione')->assertOk();

        $this->agentPost('/agent/camera')->assertStatus(409);
    }

    // ── Acquisizione documento ─────────────────────────────────────────────

    public function test_acquisizione_richiede_prenotazione_salvata(): void
    {
        $this->agentPost('/agent/acquisizione')->assertStatus(422);
    }

    public function test_acquisizione_avviata_e_pendente(): void
    {
        $this->agentPost('/agent/form', [
            'nome' => 'Mario', 'cognome' => 'Rossi',
            'check_in'  => now()->toDateString(),
            'check_out' => now()->addDay()->toDateString(),
        ]);
        $this->agentPost('/agent/prenotazione')->assertOk();

        $this->agentPost('/agent/acquisizione')->assertOk();
        $this->agentPost('/agent/acquisizione/stato')
            ->assertOk()
            ->assertJsonPath('stato', 'pendente');
    }

    // ── Chiusura sessione ──────────────────────────────────────────────────

    public function test_termina_chiude_la_sessione(): void
    {
        $this->agentPost('/agent/termina')->assertOk();

        // La sessione non esiste più → le azioni successive sono rifiutate
        $this->agentPost('/agent/form', ['nome' => 'Mario'])->assertStatus(404);
    }
}
