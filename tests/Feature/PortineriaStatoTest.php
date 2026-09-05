<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\User;
use App\Services\PortineriaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * State-machine degli stati chiosco via PortineriaService / StatoChioscoController.
 *
 * Copre: transizioni lecite/illecite (StatoChiosco::transizioniLecite()),
 * matrice permessi del Receptionist Lite (solo idle ↔ in_nascosto),
 * messaggio di attesa, TTL dello stato in Cache e limite sessioni concorrenti.
 */
class PortineriaStatoTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private Chiosco $chiosco;
    private User $receptionist;
    private User $lite;

    protected function setUp(): void
    {
        parent::setUp();

        Cache::flush();

        $this->hotel        = $this->creaHotel();
        $this->chiosco      = $this->creaChiosco('Chiosco 1');
        $this->receptionist = $this->creaUtente(Profilo::Receptionist);
        $this->lite         = $this->creaUtente(Profilo::ReceptionistLite);
    }

    private function creaHotel(int $concorrentiMax = 3): Hotel
    {
        return Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Test',
            'indirizzo'                => 'Via Test 1',
            'chioschi_concorrenti_max' => $concorrentiMax,
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

    private function creaChiosco(string $nome, ?Hotel $hotel = null): Chiosco
    {
        return Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => ($hotel ?? $this->hotel)->id,
            'nome'          => $nome,
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => false,
            'has_stampante' => false,
            'attivo'        => true,
        ]);
    }

    private function creaUtente(Profilo $profilo): User
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

        $utente->hotels()->attach($this->hotel->id);

        return $utente;
    }

    /** Imposta lo stato runtime del chiosco direttamente via service (setup). */
    private function forzaStato(StatoChiosco $stato, ?Chiosco $chiosco = null): void
    {
        app(PortineriaService::class)->impostaStato($chiosco ?? $this->chiosco, $stato);
    }

    private function patchStato(User $utente, string $stato, ?string $messaggio = null)
    {
        $payload = ['stato' => $stato];
        if ($messaggio !== null) {
            $payload['messaggio'] = $messaggio;
        }

        return $this->actingAs($utente)
            ->patchJson("/portineria/chioschi/{$this->chiosco->id}/stato", $payload);
    }

    // ── Stato di default ───────────────────────────────────────────────────

    public function test_stato_di_default_e_offline(): void
    {
        $this->actingAs($this->receptionist)
            ->getJson("/portineria/chioschi/{$this->chiosco->id}/stato")
            ->assertOk()
            ->assertJsonPath('stato', 'offline')
            ->assertJsonPath('messaggio', null);
    }

    // ── Transizioni lecite ─────────────────────────────────────────────────

    public function test_transizione_lecita_offline_verso_idle(): void
    {
        $this->patchStato($this->receptionist, 'idle')
            ->assertOk()
            ->assertJsonPath('stato', 'idle');

        // Lo stato runtime vive in Cache con chiave kiosk_state:{id}
        $this->assertSame('idle', Cache::get("kiosk_state:{$this->chiosco->id}"));
    }

    public function test_parlato_parte_direttamente_da_idle_chiamata_e_nascosto(): void
    {
        $sessioni = app(\App\Services\WebRtcSessionService::class);

        foreach ([StatoChiosco::Idle, StatoChiosco::InChiamata, StatoChiosco::InNascosto, StatoChiosco::MessaggioAttesa] as $da) {
            $this->forzaStato($da);
            $vecchia = $da === StatoChiosco::InNascosto
                ? $sessioni->crea($this->receptionist->id, $this->chiosco->id, $this->hotel->id, 'nascosto')
                : null;

            $r = $this->actingAs($this->receptionist)
                ->postJson('/portineria/webrtc/sessione', ['chiosco_id' => $this->chiosco->id])
                ->assertOk();

            $this->assertSame(StatoChiosco::InParlato, app(PortineriaService::class)->statoChiosco($this->chiosco->id), "da {$da->value}");
            $this->assertSame($r->json('session_id'), $sessioni->sessioneAttivaPerChiosco($this->chiosco->id));
            $this->assertSame('parlato', $sessioni->trova($r->json('session_id'))['tipo']);
            if ($vecchia) {
                $this->assertNull($sessioni->trova($vecchia), 'la sessione nascosto precedente va chiusa');
            }
        }
    }

    public function test_parlato_non_parte_da_offline_ne_per_il_profilo_lite(): void
    {
        $this->forzaStato(StatoChiosco::Offline);
        $this->actingAs($this->receptionist)
            ->postJson('/portineria/webrtc/sessione', ['chiosco_id' => $this->chiosco->id])
            ->assertStatus(422);

        $this->forzaStato(StatoChiosco::Idle);
        $this->actingAs($this->lite)
            ->postJson('/portineria/webrtc/sessione', ['chiosco_id' => $this->chiosco->id])
            ->assertStatus(422);
        $this->assertSame(StatoChiosco::Idle, app(PortineriaService::class)->statoChiosco($this->chiosco->id));
    }

    public function test_transizione_lecita_idle_verso_in_chiaro(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        $this->patchStato($this->receptionist, 'in_chiaro')
            ->assertOk()
            ->assertJsonPath('stato', 'in_chiaro');
    }

    public function test_percorso_completo_chiamata_parlato_chiusura(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        // idle → in_chiamata → in_chiaro → in_parlato → idle
        $this->patchStato($this->receptionist, 'in_chiamata')->assertOk();
        $this->patchStato($this->receptionist, 'in_chiaro')->assertOk();
        $this->patchStato($this->receptionist, 'in_parlato')->assertOk();
        $this->patchStato($this->receptionist, 'idle')->assertOk();

        $this->assertSame(
            StatoChiosco::Idle,
            app(PortineriaService::class)->statoChiosco($this->chiosco->id)
        );
    }

    // ── Transizioni illecite ───────────────────────────────────────────────

    public function test_transizione_illecita_offline_verso_in_chiaro_rifiutata(): void
    {
        $this->patchStato($this->receptionist, 'in_chiaro')
            ->assertStatus(422)
            ->assertJsonPath('attuale', 'offline');
    }

    public function test_transizione_illecita_in_parlato_verso_messaggio_attesa_rifiutata(): void
    {
        $this->forzaStato(StatoChiosco::InParlato);

        $this->patchStato($this->receptionist, 'messaggio_attesa')
            ->assertStatus(422)
            ->assertJsonPath('attuale', 'in_parlato');
    }

    public function test_transizione_illecita_in_nascosto_verso_in_parlato_rifiutata(): void
    {
        $this->forzaStato(StatoChiosco::InNascosto);

        $this->patchStato($this->receptionist, 'in_parlato')->assertStatus(422);
    }

    public function test_stato_non_valido_rifiutato_dalla_validazione(): void
    {
        $this->patchStato($this->receptionist, 'stato_inventato')->assertStatus(422);
    }

    // ── Permessi Receptionist Lite ─────────────────────────────────────────

    public function test_lite_puo_avviare_e_chiudere_il_nascosto(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        $this->patchStato($this->lite, 'in_nascosto')->assertOk();
        $this->patchStato($this->lite, 'idle')->assertOk();
    }

    public function test_lite_non_puo_passare_in_chiaro(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        // idle → in_chiaro è lecita per la state machine ma negata al profilo Lite
        $this->patchStato($this->lite, 'in_chiaro')
            ->assertStatus(422)
            ->assertJsonPath('attuale', 'idle');
    }

    public function test_lite_non_puo_rispondere_a_una_chiamata(): void
    {
        $this->forzaStato(StatoChiosco::InChiamata);

        $this->patchStato($this->lite, 'in_chiaro')->assertStatus(422);
        $this->patchStato($this->lite, 'in_nascosto')->assertStatus(422);
    }

    public function test_lite_non_puo_impostare_messaggio_attesa(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        $this->patchStato($this->lite, 'messaggio_attesa', 'Torno subito')->assertStatus(422);
    }

    // ── Messaggio attesa ───────────────────────────────────────────────────

    public function test_messaggio_attesa_impostato_e_visibile(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        $this->patchStato($this->receptionist, 'messaggio_attesa', 'Il receptionist arriva subito')
            ->assertOk()
            ->assertJsonPath('messaggio', 'Il receptionist arriva subito');

        $this->actingAs($this->receptionist)
            ->getJson("/portineria/chioschi/{$this->chiosco->id}/stato")
            ->assertOk()
            ->assertJsonPath('stato', 'messaggio_attesa')
            ->assertJsonPath('messaggio', 'Il receptionist arriva subito');
    }

    public function test_ritorno_a_idle_cancella_il_messaggio_attesa(): void
    {
        $this->forzaStato(StatoChiosco::Idle);
        $this->patchStato($this->receptionist, 'messaggio_attesa', 'Attendere prego')->assertOk();

        $this->patchStato($this->receptionist, 'idle')->assertOk();

        $this->actingAs($this->receptionist)
            ->getJson("/portineria/chioschi/{$this->chiosco->id}/stato")
            ->assertOk()
            ->assertJsonPath('stato', 'idle')
            ->assertJsonPath('messaggio', null);
    }

    // ── TTL in Cache ───────────────────────────────────────────────────────

    public function test_lo_stato_scade_dopo_il_ttl_e_torna_offline(): void
    {
        $this->forzaStato(StatoChiosco::Idle);

        $this->assertSame(
            StatoChiosco::Idle,
            app(PortineriaService::class)->statoChiosco($this->chiosco->id)
        );

        // TTL_STATO = 300s → dopo 6 minuti lo stato non è più in cache
        $this->travel(6)->minutes();

        $this->assertSame(
            StatoChiosco::Offline,
            app(PortineriaService::class)->statoChiosco($this->chiosco->id)
        );
    }

    public function test_rinnova_stato_estende_il_ttl(): void
    {
        $service = app(PortineriaService::class);
        $this->forzaStato(StatoChiosco::InParlato);

        // A 4 minuti lo stato è ancora vivo: il rinnovo riparte da 5 minuti
        $this->travel(4)->minutes();
        $service->rinnovaStato($this->chiosco->id);

        $this->travel(4)->minutes();
        $this->assertSame(StatoChiosco::InParlato, $service->statoChiosco($this->chiosco->id));
    }

    // ── Sicurezza cross-hotel ──────────────────────────────────────────────

    public function test_chiosco_di_altro_hotel_non_gestibile(): void
    {
        $altroHotel   = Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Beta',
            'indirizzo'                => 'Via Beta 2',
            'chioschi_concorrenti_max' => 3,
            'checkout_libero'          => false,
            'checkout_ora'             => '10:00:00',
            'lingua_default'           => 'it',
            'lingue_abilitate'         => ['it'],
            'suoneria_attiva'          => true,
            'volume_suoneria'          => 80,
            'numero_massimo_pax'       => 4,
            'campi_pax_obbligatori'    => ['nome'],
        ]);
        $altroChiosco = $this->creaChiosco('Chiosco Beta', $altroHotel);

        $this->actingAs($this->receptionist)
            ->patchJson("/portineria/chioschi/{$altroChiosco->id}/stato", ['stato' => 'idle'])
            ->assertStatus(403);

        $this->actingAs($this->receptionist)
            ->getJson("/portineria/chioschi/{$altroChiosco->id}/stato")
            ->assertStatus(403);
    }

    // ── Limite sessioni concorrenti ────────────────────────────────────────

    public function test_limite_sessioni_concorrenti_blocca_nuova_connessione(): void
    {
        // Hotel con max 1 sessione concorrente
        $this->hotel->update(['chioschi_concorrenti_max' => 1]);

        $altroChiosco = $this->creaChiosco('Chiosco 2');
        $this->forzaStato(StatoChiosco::InChiaro, $altroChiosco); // sessione già attiva

        $this->forzaStato(StatoChiosco::Idle); // chiosco target pronto

        $this->patchStato($this->receptionist, 'in_chiaro')
            ->assertStatus(422)
            ->assertJsonPath('attuale', 'idle');
    }

    public function test_limite_non_blocca_transizioni_interne_alla_sessione(): void
    {
        $this->hotel->update(['chioschi_concorrenti_max' => 1]);

        // La sessione attiva è proprio quella del chiosco target:
        // in_chiaro → in_parlato non è una "nuova" connessione
        $this->forzaStato(StatoChiosco::InChiaro);

        $this->patchStato($this->receptionist, 'in_parlato')->assertOk();
    }

    // ── Azioni dell'ospite con monitoraggio nascosto attivo ────────────────
    // L'ospite non sa di essere osservato: chiamata touch e avvio AI non
    // devono mai cadere nel vuoto — la sessione covert viene chiusa.

    private function kioskUser(): User
    {
        return $this->creaUtente(Profilo::Chiosco);
    }

    public function test_chiamata_touch_parte_anche_da_monitoraggio_nascosto(): void
    {
        $this->forzaStato(StatoChiosco::InNascosto);
        $sessioni = app(\App\Services\WebRtcSessionService::class);
        $covert   = $sessioni->crea($this->receptionist->id, $this->chiosco->id, $this->hotel->id, 'nascosto');

        $this->actingAs($this->kioskUser())
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/chiama')
            ->assertOk()
            ->assertJsonPath('stato', 'in_chiamata');

        // La sessione covert è stata chiusa e lo stato è in_chiamata
        $this->assertNull($sessioni->sessioneAttivaPerChiosco($this->chiosco->id));
        $this->assertSame(
            StatoChiosco::InChiamata,
            app(PortineriaService::class)->statoChiosco($this->chiosco->id)
        );
        $this->assertNull($sessioni->trova($covert));
    }

    public function test_chiamata_touch_parte_da_offline(): void
    {
        $this->forzaStato(StatoChiosco::Offline);

        $this->actingAs($this->kioskUser())
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/chiama')
            ->assertOk()
            ->assertJsonPath('stato', 'in_chiamata');
    }

    public function test_chiamata_touch_rifiutata_durante_un_collegamento_attivo(): void
    {
        $this->forzaStato(StatoChiosco::InParlato);

        $this->actingAs($this->kioskUser())
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/chiama')
            ->assertStatus(422);
    }
}
