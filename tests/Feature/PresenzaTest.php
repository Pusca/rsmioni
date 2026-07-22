<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Presenza video del receptionist verso i chioschi (stanze presenza-{hotelId}).
 *
 * Copre: emissione token per receptionist (uno per hotel, canPublish=true),
 * token del chiosco in sola visione sulla stanza del proprio hotel,
 * autorizzazioni per profilo e comportamento senza configurazione LiveKit.
 */
class PresenzaTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private Chiosco $chiosco;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hotel = Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => 'Hotel Presenza',
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
            'nome'          => 'Chiosco 1',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);
    }

    private function creaUtente(Profilo $profilo, ?Hotel $hotel = null): User
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

        if ($hotel) {
            $utente->hotels()->attach($hotel->id);
        }

        return $utente;
    }

    private function configuraLiveKit(): void
    {
        config([
            'services.livekit.url'        => 'wss://livekit.test',
            'services.livekit.api_key'    => 'test-key',
            'services.livekit.api_secret' => 'test-secret',
        ]);
    }

    // ── Receptionist ───────────────────────────────────────────────────────

    public function test_receptionist_riceve_un_token_presenza_per_ogni_suo_hotel(): void
    {
        $this->configuraLiveKit();
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $risposta = $this->actingAs($receptionist)
            ->postJson('/portineria/presenza/token')
            ->assertOk()
            ->assertJsonCount(1, 'stanze')
            ->assertJsonPath('stanze.0.hotel_id', $this->hotel->id)
            ->assertJsonPath('stanze.0.url', 'wss://livekit.test');

        // Il token è per la stanza presenza dell'hotel, con pubblicazione
        $payload = json_decode(base64_decode(strtr(
            explode('.', $risposta->json('stanze.0.token'))[1], '-_', '+/'
        )), true);
        $this->assertSame('presenza-' . $this->hotel->id, $payload['video']['room']);
        $this->assertTrue($payload['video']['canPublish']);
    }

    public function test_receptionist_lite_riceve_il_token_presenza(): void
    {
        $this->configuraLiveKit();
        $lite = $this->creaUtente(Profilo::ReceptionistLite, $this->hotel);

        $this->actingAs($lite)
            ->postJson('/portineria/presenza/token')
            ->assertOk()
            ->assertJsonCount(1, 'stanze');
    }

    public function test_senza_configurazione_livekit_risponde_503(): void
    {
        // L'ambiente locale può avere LiveKit configurato nel .env: azzera
        config([
            'services.livekit.url'        => null,
            'services.livekit.api_key'    => null,
            'services.livekit.api_secret' => null,
        ]);
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $this->actingAs($receptionist)
            ->postJson('/portineria/presenza/token')
            ->assertStatus(503);
    }

    public function test_account_chiosco_non_accede_al_token_presenza_portineria(): void
    {
        $this->configuraLiveKit();
        $chioscoUser = $this->creaUtente(Profilo::Chiosco, $this->hotel);

        $this->actingAs($chioscoUser)
            ->postJson('/portineria/presenza/token')
            ->assertStatus(403);
    }

    // ── Chiosco ────────────────────────────────────────────────────────────

    public function test_chiosco_riceve_il_token_presenza_in_sola_visione(): void
    {
        $this->configuraLiveKit();
        $chioscoUser = $this->creaUtente(Profilo::Chiosco, $this->hotel);

        $risposta = $this->actingAs($chioscoUser)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/presenza/token')
            ->assertOk()
            ->assertJsonPath('url', 'wss://livekit.test');

        $payload = json_decode(base64_decode(strtr(
            explode('.', $risposta->json('token'))[1], '-_', '+/'
        )), true);
        $this->assertSame('presenza-' . $this->hotel->id, $payload['video']['room']);
        $this->assertFalse($payload['video']['canPublish']);
    }

    public function test_chiosco_senza_selezione_riceve_403(): void
    {
        $this->configuraLiveKit();
        $chioscoUser = $this->creaUtente(Profilo::Chiosco, $this->hotel);

        $this->actingAs($chioscoUser)
            ->getJson('/kiosk/presenza/token')
            ->assertStatus(403);
    }

    public function test_receptionist_non_accede_al_token_presenza_del_chiosco(): void
    {
        $this->configuraLiveKit();
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $this->actingAs($receptionist)
            ->getJson('/kiosk/presenza/token')
            ->assertStatus(403);
    }
}
