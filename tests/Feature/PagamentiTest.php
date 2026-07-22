<?php

namespace Tests\Feature;

use App\Enums\EsitoPOS;
use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\Pagamento;
use App\Models\Prenotazione;
use App\Models\User;
use App\Services\PortineriaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Flusso pagamento POS remoto.
 *
 * Lato receptionist: PagamentoPOSController (store/stato/destroy).
 * Lato chiosco:      KioskPagamentoController (show/esito/annulla).
 *
 * Vincolo RH24: il POS remoto è avviabile solo con il chiosco in_parlato.
 * Sincronizzazione: record DB (storico) + chiave Cache pagamento_pendente.
 */
class PagamentiTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private Chiosco $chiosco;
    private Prenotazione $prenotazione;
    private User $receptionist;
    private User $accountChiosco;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        $this->hotel = $this->creaHotel('Hotel Test');

        $this->chiosco = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->hotel->id,
            'nome'          => 'Chiosco POS',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);

        $this->prenotazione = Prenotazione::create([
            'id'                  => Str::uuid()->toString(),
            'hotel_id'            => $this->hotel->id,
            'codice'              => 'TEST-001',
            'check_in'            => now()->toDateString(),
            'check_out'           => now()->addDays(2)->toDateString(),
            'pax'                 => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
            'nome'                => 'Mario',
            'cognome'             => 'Rossi',
            'tipo_pagamento'      => 'da_pagare',
            'documento_identita'  => 'da_acquisire',
            'inserito_da_profilo' => 'receptionist',
        ]);

        $this->receptionist   = $this->creaUtente(Profilo::Receptionist, $this->hotel);
        $this->accountChiosco = $this->creaUtente(Profilo::Chiosco, $this->hotel);
    }

    private function creaHotel(string $nome): Hotel
    {
        return Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => $nome,
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
    }

    private function creaUtente(Profilo $profilo, Hotel $hotel): User
    {
        $utente = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'utente_' . Str::random(8),
            'email'        => Str::random(10) . '@test.local',
            'password'     => Hash::make('password'),
            'profilo'      => $profilo,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);

        $utente->hotels()->attach($hotel->id);

        return $utente;
    }

    private function mettiInParlato(?Chiosco $chiosco = null): void
    {
        app(PortineriaService::class)->impostaStato($chiosco ?? $this->chiosco, StatoChiosco::InParlato);
    }

    /** Crea un pagamento pendente completo (receptionist → chiosco). Ritorna pagamento_id. */
    private function creaPagamentoPendente(float $importo = 120.50): string
    {
        $this->mettiInParlato();

        $risposta = $this->actingAs($this->receptionist)->postJson('/pagamenti', [
            'chiosco_id'      => $this->chiosco->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => $importo,
            'causale'         => 'Soggiorno',
        ])->assertOk();

        return $risposta->json('pagamento_id');
    }

    // ── Creazione richiesta (lato receptionist) ────────────────────────────

    public function test_receptionist_crea_pagamento_con_chiosco_in_parlato(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $this->assertDatabaseHas('pagamenti', [
            'id'              => $pagamentoId,
            'prenotazione_id' => $this->prenotazione->id,
            'chiosco_id'      => $this->chiosco->id,
            'esito'           => 'pending',
            'eseguito_da'     => $this->receptionist->id,
        ]);

        $pendente = Cache::get("pagamento_pendente:chiosco_{$this->chiosco->id}");
        $this->assertNotNull($pendente);
        $this->assertSame($pagamentoId, $pendente['pagamento_id']);
        $this->assertSame(120.50, $pendente['importo']);
    }

    public function test_pagamento_rifiutato_se_chiosco_non_in_parlato(): void
    {
        // Stato idle: manca il collegamento in parlato richiesto dal vincolo RH24
        app(PortineriaService::class)->impostaStato($this->chiosco, StatoChiosco::Idle);

        $this->actingAs($this->receptionist)->postJson('/pagamenti', [
            'chiosco_id'      => $this->chiosco->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => 50,
        ])->assertStatus(422)
            ->assertJsonPath('stato', 'idle');

        $this->assertSame(0, Pagamento::count());
    }

    public function test_pagamento_rifiutato_se_chiosco_senza_pos(): void
    {
        $senzaPos = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->hotel->id,
            'nome'          => 'Chiosco senza POS',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => false,
            'has_stampante' => false,
            'attivo'        => true,
        ]);
        $this->mettiInParlato($senzaPos);

        $this->actingAs($this->receptionist)->postJson('/pagamenti', [
            'chiosco_id'      => $senzaPos->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => 50,
        ])->assertStatus(422);
    }

    public function test_pagamento_rifiutato_su_chiosco_di_altro_hotel(): void
    {
        $altroHotel   = $this->creaHotel('Hotel Beta');
        $altroChiosco = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $altroHotel->id,
            'nome'          => 'Chiosco Beta',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);

        $this->actingAs($this->receptionist)->postJson('/pagamenti', [
            'chiosco_id'      => $altroChiosco->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => 50,
        ])->assertStatus(403);
    }

    public function test_importo_non_valido_rifiutato(): void
    {
        $this->mettiInParlato();

        $this->actingAs($this->receptionist)->postJson('/pagamenti', [
            'chiosco_id'      => $this->chiosco->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => 0,
        ])->assertStatus(422)->assertJsonValidationErrors('importo');
    }

    // ── Autorizzazione ─────────────────────────────────────────────────────

    public function test_receptionist_lite_escluso_dal_pos(): void
    {
        $lite = $this->creaUtente(Profilo::ReceptionistLite, $this->hotel);
        $this->mettiInParlato();

        $this->actingAs($lite)->postJson('/pagamenti', [
            'chiosco_id'      => $this->chiosco->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => 50,
        ])->assertForbidden();

        $this->actingAs($lite)
            ->getJson("/pagamenti/{$this->chiosco->id}/stato?pagamento_id=x")
            ->assertForbidden();
    }

    public function test_account_chiosco_non_puo_creare_pagamenti(): void
    {
        $this->mettiInParlato();

        $this->actingAs($this->accountChiosco)->postJson('/pagamenti', [
            'chiosco_id'      => $this->chiosco->id,
            'prenotazione_id' => $this->prenotazione->id,
            'importo'         => 50,
        ])->assertForbidden();
    }

    // ── Lato kiosk: polling richiesta pendente ─────────────────────────────

    public function test_kiosk_vede_il_pagamento_pendente(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/pagamento-pendente')
            ->assertOk()
            ->assertJsonPath('pendente', true)
            ->assertJsonPath('pagamento_id', $pagamentoId)
            ->assertJsonPath('importo', 120.5)
            ->assertJsonPath('causale', 'Soggiorno');
    }

    public function test_kiosk_senza_sessione_chiosco_non_vede_pendenti(): void
    {
        $this->creaPagamentoPendente();

        $this->actingAs($this->accountChiosco)
            ->getJson('/kiosk/pagamento-pendente')
            ->assertOk()
            ->assertJsonPath('pendente', false);
    }

    // ── Lato kiosk: esito ──────────────────────────────────────────────────

    public function test_kiosk_segnala_esito_ok(): void
    {
        $pagamentoId = $this->creaPagamentoPendente(importo: 99.90);

        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/pagamenti/esito', ['esito' => 'ok'])
            ->assertOk();

        $pagamento = Pagamento::find($pagamentoId);
        $this->assertSame(EsitoPOS::Ok, $pagamento->esito);
        // Senza importo_effettivo esplicito viene usato l'importo richiesto
        $this->assertSame('99.90', $pagamento->importo_effettivo);
        $this->assertNotNull($pagamento->data_operazione);

        // La richiesta pendente è stata consumata
        $this->assertNull(Cache::get("pagamento_pendente:chiosco_{$this->chiosco->id}"));

        // Polling receptionist: vede l'esito finale
        $this->actingAs($this->receptionist)
            ->getJson("/pagamenti/{$this->chiosco->id}/stato?pagamento_id={$pagamentoId}")
            ->assertOk()
            ->assertJsonPath('esito', 'ok');
    }

    public function test_kiosk_segnala_esito_ko_senza_importo_effettivo(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/pagamenti/esito', ['esito' => 'ko'])
            ->assertOk();

        $pagamento = Pagamento::find($pagamentoId);
        $this->assertSame(EsitoPOS::Ko, $pagamento->esito);
        $this->assertNull($pagamento->importo_effettivo);
    }

    public function test_esito_non_valido_rifiutato(): void
    {
        $this->creaPagamentoPendente();

        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/pagamenti/esito', ['esito' => 'forse'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('esito');
    }

    public function test_esito_senza_pagamento_pendente_rifiutato(): void
    {
        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/pagamenti/esito', ['esito' => 'ok'])
            ->assertStatus(422);
    }

    public function test_kiosk_di_altro_chiosco_non_puo_chiudere_il_pagamento(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $altroChiosco = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->hotel->id,
            'nome'          => 'Chiosco 2',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);

        // La sessione punta a un chiosco diverso: nessun pendente per lui → 422
        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $altroChiosco->id])
            ->postJson('/kiosk/pagamenti/esito', ['esito' => 'ok'])
            ->assertStatus(422);

        // Il pagamento del chiosco originale resta pending
        $this->assertSame(EsitoPOS::Pending, Pagamento::find($pagamentoId)->esito);
    }

    public function test_esito_senza_sessione_chiosco_rifiutato(): void
    {
        $this->creaPagamentoPendente();

        $this->actingAs($this->accountChiosco)
            ->postJson('/kiosk/pagamenti/esito', ['esito' => 'ok'])
            ->assertStatus(422);
    }

    // ── Annullamento ───────────────────────────────────────────────────────

    public function test_receptionist_annulla_il_pagamento(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $this->actingAs($this->receptionist)
            ->deleteJson("/pagamenti/{$this->chiosco->id}", ['pagamento_id' => $pagamentoId])
            ->assertOk();

        $this->assertSame(EsitoPOS::Annullato, Pagamento::find($pagamentoId)->esito);

        // Il chiosco non vede più la richiesta
        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/pagamento-pendente')
            ->assertOk()
            ->assertJsonPath('pendente', false);
    }

    public function test_kiosk_annulla_il_pagamento(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->deleteJson('/kiosk/pagamenti')
            ->assertOk();

        $this->assertSame(EsitoPOS::Annullato, Pagamento::find($pagamentoId)->esito);
        $this->assertNull(Cache::get("pagamento_pendente:chiosco_{$this->chiosco->id}"));
    }

    // ── Polling stato (lato receptionist) ──────────────────────────────────

    public function test_polling_stato_ritorna_pending(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $this->actingAs($this->receptionist)
            ->getJson("/pagamenti/{$this->chiosco->id}/stato?pagamento_id={$pagamentoId}")
            ->assertOk()
            ->assertJsonPath('esito', 'pending')
            ->assertJsonPath('importo_effettivo', null);
    }

    public function test_polling_stato_senza_pagamento_id_rifiutato(): void
    {
        $this->actingAs($this->receptionist)
            ->getJson("/pagamenti/{$this->chiosco->id}/stato")
            ->assertStatus(422);
    }

    public function test_polling_stato_con_pagamento_di_altro_chiosco_non_trovato(): void
    {
        $pagamentoId = $this->creaPagamentoPendente();

        $altroChiosco = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->hotel->id,
            'nome'          => 'Chiosco 3',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);

        $this->actingAs($this->receptionist)
            ->getJson("/pagamenti/{$altroChiosco->id}/stato?pagamento_id={$pagamentoId}")
            ->assertStatus(404);
    }
}
