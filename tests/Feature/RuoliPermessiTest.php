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
 * Middleware role: sulle rotte principali (routes/web.php) + RoleGuard.
 *
 * Copre: accessi consentiti/negati per profilo, redirect guest → login,
 * utente disattivato (attivo=false) e selezione chiosco.
 */
class RuoliPermessiTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private Chiosco $chiosco;

    protected function setUp(): void
    {
        parent::setUp();

        $this->hotel   = $this->creaHotel('Hotel Alfa');
        $this->chiosco = $this->creaChiosco($this->hotel);
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

    private function creaChiosco(Hotel $hotel, string $nome = 'Chiosco 1'): Chiosco
    {
        return Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $hotel->id,
            'nome'          => $nome,
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => false,
            'attivo'        => true,
        ]);
    }

    private function creaUtente(Profilo $profilo, ?Hotel $hotel = null, bool $attivo = true): User
    {
        $utente = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => 'utente_' . Str::random(8),
            'email'        => Str::random(10) . '@test.local',
            'password'     => Hash::make('password'),
            'profilo'      => $profilo,
            'ip_whitelist' => [],
            'attivo'       => $attivo,
        ]);

        if ($hotel) {
            $utente->hotels()->attach($hotel->id);
        }

        return $utente;
    }

    // ── Guest → redirect login ─────────────────────────────────────────────

    public function test_guest_su_portineria_viene_rediretto_al_login(): void
    {
        $this->get('/portineria')->assertRedirect(route('login'));
    }

    public function test_guest_su_prenotazioni_viene_rediretto_al_login(): void
    {
        $this->get('/prenotazioni')->assertRedirect(route('login'));
    }

    public function test_guest_su_camere_viene_rediretto_al_login(): void
    {
        $this->get('/camere')->assertRedirect(route('login'));
    }

    // ── Portineria ─────────────────────────────────────────────────────────

    public function test_receptionist_accede_alla_portineria(): void
    {
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $this->actingAs($receptionist)
            ->getJson("/portineria/chioschi/{$this->chiosco->id}/stato")
            ->assertOk()
            ->assertJsonPath('stato', 'offline');
    }

    public function test_receptionist_lite_accede_alla_portineria(): void
    {
        $lite = $this->creaUtente(Profilo::ReceptionistLite, $this->hotel);

        $this->actingAs($lite)
            ->getJson("/portineria/chioschi/{$this->chiosco->id}/stato")
            ->assertOk();
    }

    public function test_gestore_hotel_non_accede_alla_portineria(): void
    {
        $gestore = $this->creaUtente(Profilo::GestoreHotel, $this->hotel);

        $this->actingAs($gestore)->get('/portineria')->assertForbidden();
    }

    public function test_chiosco_non_accede_alla_portineria(): void
    {
        $chiosco = $this->creaUtente(Profilo::Chiosco, $this->hotel);

        $this->actingAs($chiosco)->get('/portineria')->assertForbidden();
    }

    // ── Prenotazioni ───────────────────────────────────────────────────────

    public function test_receptionist_lite_non_accede_alle_prenotazioni(): void
    {
        $lite = $this->creaUtente(Profilo::ReceptionistLite, $this->hotel);

        $this->actingAs($lite)->get('/prenotazioni')->assertForbidden();
    }

    public function test_chiosco_non_accede_alle_prenotazioni(): void
    {
        $chiosco = $this->creaUtente(Profilo::Chiosco, $this->hotel);

        $this->actingAs($chiosco)->get('/prenotazioni')->assertForbidden();
    }

    public function test_gestore_hotel_accede_alle_prenotazioni(): void
    {
        $gestore = $this->creaUtente(Profilo::GestoreHotel, $this->hotel);

        $this->actingAs($gestore)->get('/prenotazioni')->assertOk();
    }

    // ── POS ────────────────────────────────────────────────────────────────

    public function test_receptionist_lite_non_accede_al_pos(): void
    {
        $lite = $this->creaUtente(Profilo::ReceptionistLite, $this->hotel);

        $this->actingAs($lite)->postJson('/pagamenti', [])->assertForbidden();
        $this->actingAs($lite)->getJson("/pagamenti/{$this->chiosco->id}/stato")->assertForbidden();
    }

    // ── Camere ─────────────────────────────────────────────────────────────

    public function test_gestore_hotel_accede_alle_camere(): void
    {
        $gestore = $this->creaUtente(Profilo::GestoreHotel, $this->hotel);

        $this->actingAs($gestore)->get('/camere')->assertOk();
    }

    public function test_receptionist_non_accede_alla_gestione_camere(): void
    {
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $this->actingAs($receptionist)->get('/camere')->assertForbidden();
    }

    // ── Configurazioni ─────────────────────────────────────────────────────

    public function test_gestore_hotel_accede_alle_configurazioni(): void
    {
        $gestore = $this->creaUtente(Profilo::GestoreHotel, $this->hotel);

        $this->actingAs($gestore)->get('/configurazioni/chioschi')->assertOk();
    }

    public function test_receptionist_non_accede_alle_configurazioni(): void
    {
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $this->actingAs($receptionist)->get('/configurazioni/chioschi')->assertForbidden();
    }

    // ── Kiosk ──────────────────────────────────────────────────────────────

    public function test_receptionist_non_accede_al_kiosk(): void
    {
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel);

        $this->actingAs($receptionist)->get('/kiosk')->assertForbidden();
    }

    public function test_account_chiosco_senza_selezione_viene_rediretto_al_selettore(): void
    {
        $chiosco = $this->creaUtente(Profilo::Chiosco, $this->hotel);

        $this->actingAs($chiosco)->get('/kiosk')->assertRedirect(route('kiosk.seleziona'));
    }

    /**
     * BUG NOTO (comportamento attuale, da NON fixare qui): la selezione del
     * chiosco valida solo `exists:chioschi,id` e NON verifica che il chiosco
     * appartenga a un hotel dell'utente. Un account chiosco può quindi
     * selezionare un chiosco di un altro hotel.
     */
    public function test_selezione_chiosco_non_verifica_appartenenza_hotel_bug_documentato(): void
    {
        $hotelAltro   = $this->creaHotel('Hotel Beta');
        $chioscoAltro = $this->creaChiosco($hotelAltro, 'Chiosco Beta');

        $account = $this->creaUtente(Profilo::Chiosco, $this->hotel); // associato solo a Hotel Alfa

        // Comportamento attuale: la selezione va a buon fine (nessun 403/422)
        $this->actingAs($account)
            ->post('/kiosk/seleziona', ['chiosco_id' => $chioscoAltro->id])
            ->assertRedirect(route('kiosk.index'))
            ->assertSessionHas('chiosco_id', $chioscoAltro->id);
    }

    // ── RoleGuard: utente disattivato ──────────────────────────────────────

    public function test_utente_disattivato_viene_rediretto_al_login(): void
    {
        $receptionist = $this->creaUtente(Profilo::Receptionist, $this->hotel, attivo: false);

        $this->actingAs($receptionist)->get('/portineria')->assertRedirect(route('login'));
    }

    public function test_gestore_disattivato_viene_rediretto_al_login(): void
    {
        $gestore = $this->creaUtente(Profilo::GestoreHotel, $this->hotel, attivo: false);

        $this->actingAs($gestore)->get('/camere')->assertRedirect(route('login'));
    }
}
