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

    // ── Ricerca prenotazione da voce (tollerante) ───────────────────────────

    private function prenotazioneInArrivo(string $nome, string $cognome, ?string $prenotante = null, int $giorni = 0, ?string $codice = null): Prenotazione
    {
        return Prenotazione::create([
            'id'                  => Str::uuid()->toString(),
            'hotel_id'            => $this->hotel->id,
            'codice'              => $codice ?? (string) random_int(1000000, 9999999),
            'check_in'            => now()->addDays($giorni)->toDateString(),
            'check_out'           => now()->addDays($giorni + 2)->toDateString(),
            'pax'                 => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
            'nome'                => $nome,
            'cognome'             => $cognome,
            'prenotante'          => $prenotante,
            'tipo_pagamento'      => 'da_pagare',
            'documento_identita'  => 'da_acquisire',
            'inserito_da_profilo' => 'gestore_hotel',
        ]);
    }

    public function test_cerca_tollera_accenti_errori_stt_e_nome_completo(): void
    {
        $p = $this->prenotazioneInArrivo('Natalia', 'Popławska');

        // accento perso e una lettera mancante (trascrizione)
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Poplaska', 'ambito' => 'arrivo'])
            ->assertOk()->assertJsonPath('prenotazione.codice', $p->codice);
        // nome e cognome insieme, invertiti
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Natalia Poplawska', 'ambito' => 'arrivo'])
            ->assertOk()->assertJsonPath('prenotazione.codice', $p->codice);
        // solo il nome nel campo cognome
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'natalia', 'ambito' => 'arrivo'])
            ->assertOk()->assertJsonPath('prenotazione.codice', $p->codice);
        // nome sbagliato del tutto → niente
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Bianchi', 'ambito' => 'arrivo'])
            ->assertStatus(404);
    }

    public function test_cerca_trova_anche_per_nome_di_chi_ha_prenotato_e_per_codice_slope(): void
    {
        $p = $this->prenotazioneInArrivo('Francesco', 'Pagliuca', prenotante: 'Salvatore Esposito', codice: '7725229');

        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Esposito', 'ambito' => 'arrivo'])
            ->assertOk()->assertJsonPath('prenotazione.cognome', 'Pagliuca')->assertJsonPath('prenotazione.prenotante', 'Salvatore Esposito');

        $this->agentPost('/agent/prenotazione/cerca', ['codice' => '# 7725229', 'ambito' => 'arrivo'])
            ->assertOk()->assertJsonPath('prenotazione.codice', '7725229');
    }

    public function test_cerca_prenotazione_di_un_altro_giorno_e_riconosciuta_ma_non_agganciata(): void
    {
        $this->prenotazioneInArrivo('Anna', 'Verdi', giorni: 4);

        $r = $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Verdi', 'ambito' => 'arrivo'])
            ->assertStatus(409)
            ->assertJsonPath('fuori_finestra', true)
            ->assertJsonPath('check_in', now()->addDays(4)->toDateString());
        $this->assertStringContainsString('arrivo è previsto', $r->json('error'));

        // Non agganciata alla sessione: l'acquisizione documento non ha una prenotazione
        $this->agentPost('/agent/acquisizione', ['lingua' => 'it'])->assertStatus(422);
    }

    public function test_cerca_omonimi_lo_stesso_giorno_chiede_il_codice(): void
    {
        $this->prenotazioneInArrivo('Mario', 'Rossi');
        $this->prenotazioneInArrivo('Luigi', 'Rossi');

        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Rossi', 'ambito' => 'arrivo'])->assertStatus(409);
        // Con il nome si distingue
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Rossi', 'nome' => 'Luigi', 'ambito' => 'arrivo'])
            ->assertOk()->assertJsonPath('prenotazione.nome', 'Luigi');
    }

    // ── Walk-in disabilitato (docs/11: PMS esterno master) ──────────────────

    public function test_walkin_disabilitato_blocca_creazione_e_lista_camere(): void
    {
        $this->hotel->update(['ai_walkin_abilitato' => false]);
        $this->camera('101', matrimoniali: 1);

        $this->agentPost('/agent/form', [
            'check_in'  => now()->toDateString(),
            'check_out' => now()->addDays(2)->toDateString(),
            'adulti'    => 2,
        ])->assertOk();

        $this->agentPost('/agent/prenotazione')->assertStatus(403);
        $this->agentPost('/agent/camere')->assertStatus(403);
        $this->assertSame(0, Prenotazione::count());
    }

    public function test_walkin_disabilitato_permette_checkin_su_prenotazione_esistente(): void
    {
        $this->hotel->update(['ai_walkin_abilitato' => false]);
        $camera = $this->camera('102', matrimoniali: 1);

        $pren = Prenotazione::create([
            'id'                  => Str::uuid()->toString(),
            'hotel_id'            => $this->hotel->id,
            'codice'              => '7725229',
            'check_in'            => now()->toDateString(),
            'check_out'           => now()->addDay()->toDateString(),
            'pax'                 => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
            'nome'                => 'Luca',
            'cognome'             => 'Bianchi',
            'tipo_pagamento'      => 'gia_pagato',
            'documento_identita'  => 'da_acquisire',
            'inserito_da_profilo' => 'gestore_hotel',
        ]);
        $pren->camere()->attach($camera->id);

        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Bianchi', 'ambito' => 'arrivo'])
            ->assertOk()
            ->assertJsonPath('prenotazione.codice', '7725229')
            ->assertJsonPath('prenotazione.camera', '102');

        // La prenotazione agganciata consente i passi successivi (es. acquisizione documento)
        $this->agentPost('/agent/acquisizione', ['lingua' => 'it'])->assertOk();
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

    // ── Integrazione col gestionale ────────────────────────────────────────

    private function prenotazioneGestionale(array $extra = []): Prenotazione
    {
        return Prenotazione::create(array_merge([
            'id'         => Str::uuid()->toString(),
            'hotel_id'   => $this->hotel->id,
            'codice'     => 'BKG-T01',
            'nome'       => 'Giulia',
            'cognome'    => 'Ferri',
            'check_in'   => now()->toDateString(),
            'check_out'  => now()->addDays(2)->toDateString(),
            'pax'        => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
            'tipo_pagamento'      => 'da_pagare',
            'documento_identita'  => 'da_acquisire',
            'checkin_confermato'  => false,
            'inserito_da_profilo' => 'gestore_hotel',
        ], $extra));
    }

    public function test_cerca_con_ambito_arrivo_trova_la_prenotazione_del_gestionale(): void
    {
        $pren = $this->prenotazioneGestionale();

        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Ferri', 'ambito' => 'arrivo'])
            ->assertOk()
            ->assertJsonPath('prenotazione.codice', 'BKG-T01')
            ->assertJsonPath('prenotazione.checkin_confermato', false)
            ->assertJsonPath('prenotazione.pax.adulti', 2);

        // La prenotazione è agganciata alla sessione: crea è idempotente su di essa
        $this->agentPost('/agent/prenotazione')
            ->assertOk()
            ->assertJsonPath('prenotazione_id', $pren->id);
    }

    public function test_cerca_arrivo_ignora_le_prenotazioni_gia_confermate(): void
    {
        $this->prenotazioneGestionale(['checkin_confermato' => true, 'checkin_confermato_at' => now()]);

        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Ferri', 'ambito' => 'arrivo'])
            ->assertStatus(404);
    }

    public function test_termina_conferma_il_checkin_se_ci_sono_documenti(): void
    {
        $pren = $this->prenotazioneGestionale();
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Ferri', 'ambito' => 'arrivo'])->assertOk();

        \App\Models\Documento::create([
            'id'                  => Str::uuid()->toString(),
            'contesto_tipo'       => 'prenotazione',
            'contesto_id'         => $pren->id,
            'titolo'              => 'Documento test',
            'estensione'          => 'jpg',
            'storage_path'        => 'documenti/test/doc.jpg',
            'lingua'              => 'it',
            'tipo_documento'      => 'documento_identita',
            'inserito_da'         => $this->accountChiosco->id,
            'inserito_da_profilo' => 'chiosco',
        ]);

        $this->agentPost('/agent/termina')->assertOk();

        $this->assertTrue($pren->fresh()->checkin_confermato);
        $this->assertNotNull($pren->fresh()->checkin_confermato_at);
    }

    public function test_termina_non_conferma_il_checkin_senza_documenti(): void
    {
        $pren = $this->prenotazioneGestionale();
        $this->agentPost('/agent/prenotazione/cerca', ['cognome' => 'Ferri', 'ambito' => 'arrivo'])->assertOk();

        $this->agentPost('/agent/termina')->assertOk();

        $this->assertFalse($pren->fresh()->checkin_confermato);
    }
}
