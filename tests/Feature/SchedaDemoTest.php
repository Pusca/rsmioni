<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Camera;
use App\Models\Hotel;
use App\Models\User;
use App\Services\SchedaDemoService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

/**
 * Scheda demo: briefing compilato prima di una demo cliente,
 * copiato nelle informazioni che l'assistente vocale può dire.
 */
class SchedaDemoTest extends TestCase
{
    use RefreshDatabase;

    private function hotel(string $nome = 'Hotel Demo Mioni'): Hotel
    {
        return Hotel::create([
            'id'                       => Str::uuid()->toString(),
            'nome'                     => $nome,
            'demo'                     => str_contains($nome, 'Demo'),
            'indirizzo'                => 'Via Roma 1',
            'chioschi_concorrenti_max' => 3,
            'checkout_libero'          => true,
            'checkout_ora'             => null,
            'lingua_default'           => 'it',
            'lingue_abilitate'         => ['it'],
            'suoneria_attiva'          => true,
            'volume_suoneria'          => 80,
            'numero_massimo_pax'       => 4,
            'campi_pax_obbligatori'    => ['nome', 'cognome'],
        ]);
    }

    private function utente(Profilo $profilo, ?Hotel $hotel = null): User
    {
        $utente = User::create([
            'id'           => Str::uuid()->toString(),
            'username'     => $profilo->value . '_' . Str::random(4),
            'email'        => Str::random(8) . '@test.rsmioni.it',
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

    private function payload(array $extra = []): array
    {
        return array_replace([
            'nome'          => 'Hotel Demo',
            'numero_camere' => 15,
            'checkin'       => 'Mattina fino alle 15',
            'checkout'      => 'Fino alle 10',
            'colazione'     => 'Dalle 7 alle 10',
            'autobus'       => 'Autobus davanti',
            'trasporto'     => 'Servizio di trasporto e taxi lì vicino, orari qualsiasi',
            'ristoranti'    => [
                ['nome' => 'Trattoria da Mario', 'nota' => 'cucina locale, 5 minuti a piedi'],
                ['nome' => '', 'nota' => 'riga vuota da scartare'],
            ],
            'luoghi'        => [
                ['nome' => 'Centro termale', 'nota' => ''],
            ],
        ], $extra);
    }

    public function test_gestore_vede_la_scheda_con_esempio_e_il_conteggio_camere(): void
    {
        $hotel = $this->hotel();
        Camera::create([
            'hotel_id' => $hotel->id,
            'nome'     => '101',
            'tipo'     => 'Doppia',
        ]);
        Camera::create([
            'hotel_id' => $hotel->id,
            'nome'     => '102',
            'tipo'     => 'Doppia',
        ]);

        $this->actingAs($this->utente(Profilo::GestoreHotel, $hotel))
            ->get('/demo')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->component('Demo/Index')
                ->where('generica', true)
                ->where('hotel.nome_anagrafica', 'Hotel Demo')
                ->where('hotel.camere_in_anagrafica', 15)
                ->where('scheda.nome', 'Hotel Demo')
                ->where('scheda.numero_camere', 15)
                ->where('scheda.checkin', 'Mattina fino alle 15')
                ->has('scheda.ristoranti', 3)
                ->has('scheda.luoghi', 3)
                ->where('account.receptionist', 'receptionist')
                ->where('account.chiosco', 'chiosco_demo')
            );
    }

    public function test_receptionist_chiosco_e_admin_senza_hotel_non_compilano(): void
    {
        $hotel = $this->hotel();

        $this->get('/demo')->assertRedirect(route('login'));
        $this->actingAs($this->utente(Profilo::Receptionist, $hotel))->get('/demo')->assertForbidden();
        $this->actingAs($this->utente(Profilo::Chiosco, $hotel))->get('/demo')->assertForbidden();
        $this->actingAs($this->utente(Profilo::Admin))->get('/demo')->assertForbidden();
    }

    public function test_salvataggio_aggiorna_nome_checkout_e_istruzioni_di_alice(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $this->actingAs($gestore)
            ->put('/demo', $this->payload())
            ->assertRedirect(route('demo.index'));

        $hotel->refresh();

        $this->assertSame('Hotel Demo', $hotel->nome);
        $this->assertSame('10:00:00', $hotel->checkout_ora);
        $this->assertFalse($hotel->checkout_libero);
        $this->assertSame(15, $hotel->scheda_demo['numero_camere']);
        $this->assertCount(1, $hotel->scheda_demo['ristoranti']);
        $this->assertStringContainsString('Trattoria da Mario — cucina locale, 5 minuti a piedi', $hotel->istruzioni_ai);
        $this->assertStringContainsString('Centro termale', $hotel->istruzioni_ai);
        $this->assertStringContainsString('Ristoranti consigliati:', $hotel->istruzioni_ai);
        $this->assertStringNotContainsString('riga vuota', $hotel->istruzioni_ai);

        $this->actingAs($gestore)
            ->get('/demo')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page
                ->where('generica', false)
                ->where('scheda.nome', 'Hotel Demo')
                ->where('hotel.nome_anagrafica', 'Hotel Demo')
            );
    }

    public function test_le_note_libere_finiscono_nelle_istruzioni_di_alice(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $this->actingAs($gestore)
            ->put('/demo', array_replace($this->payload(), [
                'note' => "Animali ammessi di piccola taglia, 15 euro a notte.\r\nParcheggio gratuito dietro l'hotel.",
            ]))
            ->assertSessionHasNoErrors()
            ->assertRedirect(route('demo.index'));

        $hotel->refresh();
        $this->assertStringEndsWith(
            "Altre informazioni:\nAnimali ammessi di piccola taglia, 15 euro a notte.\nParcheggio gratuito dietro l'hotel.",
            $hotel->istruzioni_ai
        );
        $this->actingAs($gestore)->get('/demo')->assertInertia(fn (Assert $page) => $page
            ->where('scheda.note', "Animali ammessi di piccola taglia, 15 euro a notte.\nParcheggio gratuito dietro l'hotel.")
        );

        // Senza note, nessuna sezione vuota
        $this->actingAs($gestore)->put('/demo', array_replace($this->payload(), ['note' => '']));
        $this->assertStringNotContainsString('Altre informazioni', $hotel->fresh()->istruzioni_ai);
    }

    public function test_checkout_senza_orario_non_tocca_lora_gia_impostata(): void
    {
        $hotel = $this->hotel();
        $hotel->update([
            'checkout_libero' => false,
            'checkout_ora'    => '11:30:00',
            'scheda_demo'     => [
                'origine'       => 'personalizzata',
                'nome'          => 'Hotel Demo Mioni',
                'numero_camere' => 2,
                'checkin'       => 'Mattina fino alle 15',
                'checkout'      => 'Fino alle 11:30',
                'colazione'     => '',
                'autobus'       => '',
                'trasporto'     => '',
                'ristoranti'    => [],
                'luoghi'        => [],
            ],
        ]);

        $this->actingAs($this->utente(Profilo::GestoreHotel, $hotel))
            ->put('/demo', $this->payload(['checkout' => 'Quando la camera è pronta']))
            ->assertRedirect(route('demo.index'));

        $hotel->refresh();
        $this->assertSame('11:30:00', $hotel->checkout_ora);
        $this->assertStringContainsString('Check-out: Quando la camera è pronta', $hotel->istruzioni_ai);
    }

    public function test_un_hotel_non_associato_in_sessione_non_viene_modificato(): void
    {
        $proprio = $this->hotel('Hotel Proprio');
        $proprio->update(['demo' => true]);
        $altrui = $this->hotel('Hotel Altrui');

        $this->actingAs($this->utente(Profilo::GestoreHotel, $proprio))
            ->withSession(['hotel_corrente_id' => $altrui->id])
            ->put('/demo', $this->payload(['nome' => 'Hotel Demo']))
            ->assertRedirect(route('demo.index'));

        $this->assertSame('Hotel Altrui', $altrui->fresh()->nome);
        $this->assertNull($altrui->fresh()->scheda_demo);
        $this->assertSame('Hotel Demo', $proprio->fresh()->nome);
    }

    public function test_il_testo_composto_non_inventa_liste_vuote(): void
    {
        $testo = app(SchedaDemoService::class)->componi([
            'nome'          => 'Hotel Demo',
            'numero_camere' => 15,
            'checkin'       => 'Mattina fino alle 15',
            'checkout'      => 'Fino alle 10',
            'colazione'     => 'Dalle 7 alle 10',
            'autobus'       => 'Autobus davanti',
            'trasporto'     => 'Servizio di trasporto e taxi lì vicino, orari qualsiasi',
            'ristoranti'    => [],
            'luoghi'        => [],
        ]);

        $this->assertStringContainsString('Camere: 15', $testo);
        $this->assertStringContainsString('Ristoranti consigliati: nessuno indicato.', $testo);
        $this->assertStringContainsString('Luoghi da visitare: nessuno indicato.', $testo);
        $this->assertStringNotContainsString('Camere:', app(SchedaDemoService::class)->componi([
            'nome' => 'Hotel Demo',
            'numero_camere' => null,
        ]));
        $this->assertSame('10:00:00', app(SchedaDemoService::class)->oraCheckout('Fino alle 10'));
        $this->assertSame('10:30:00', app(SchedaDemoService::class)->oraCheckout('entro le 10:30'));
        $this->assertNull(app(SchedaDemoService::class)->oraCheckout('orari qualsiasi'));
    }

    public function test_un_hotel_reale_non_diventa_la_demo(): void
    {
        $villa = $this->hotel('Villa Vera');

        $this->actingAs($this->utente(Profilo::GestoreHotel, $villa))
            ->get('/demo')
            ->assertForbidden();

        $this->assertSame('Villa Vera', $villa->fresh()->nome);
        $this->assertNull($villa->fresh()->scheda_demo);
        $this->assertSame(0, $villa->camere()->count());
    }

    public function test_si_prova_la_portineria_e_si_torna_alla_scheda(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $this->actingAs($gestore)
            ->post('/demo/prova', ['come' => 'receptionist'])
            ->assertRedirect(route('portineria.index'));

        $this->assertSame(Profilo::Receptionist, auth()->user()->profilo);
        $this->assertSame($gestore->id, session('demo_impersonator_id'));

        $this->post('/demo/torna')
            ->assertRedirect(route('demo.index'));

        $this->assertSame($gestore->id, auth()->id());
        $this->assertFalse(session()->has('demo_impersonator_id'));
    }

    public function test_si_prova_il_chiosco(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $this->actingAs($gestore)
            ->post('/demo/prova', ['come' => 'chiosco'])
            ->assertRedirect(route('kiosk.index'));

        $this->assertSame(Profilo::Chiosco, auth()->user()->profilo);
        $this->assertNotNull(session('chiosco_id'));
    }

    public function test_la_voce_demo_compare_solo_a_chi_ha_un_hotel_demo(): void
    {
        $demo = $this->hotel();
        $villa = $this->hotel('Villa Vera');

        $this->actingAs($this->utente(Profilo::GestoreHotel, $demo))
            ->get('/prenotazioni')
            ->assertInertia(fn (Assert $page) => $page->where('demo_disponibile', true));

        $this->actingAs($this->utente(Profilo::GestoreHotel, $villa))
            ->get('/prenotazioni')
            ->assertInertia(fn (Assert $page) => $page->where('demo_disponibile', false));
    }

    public function test_gli_account_di_prova_nascono_con_password_casuale_e_si_imposta_dalla_scheda(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $this->actingAs($gestore)->get('/demo')->assertOk();

        $receptionist = User::where('username', 'receptionist')->firstOrFail();
        $chiosco = User::where('username', 'chiosco_demo')->firstOrFail();
        $this->assertFalse(Hash::check('password', $receptionist->password));
        $this->assertFalse(Hash::check('password', $chiosco->password));

        $this->actingAs($gestore)
            ->put('/demo', $this->payload(['password_prova' => 'corta']))
            ->assertSessionHasErrors('password_prova');

        $this->actingAs($gestore)
            ->put('/demo', $this->payload(['password_prova' => 'demo-due-dispositivi']))
            ->assertRedirect(route('demo.index'));

        $this->assertTrue(Hash::check('demo-due-dispositivi', $receptionist->fresh()->password));
        $this->assertTrue(Hash::check('demo-due-dispositivi', $chiosco->fresh()->password));

        // Senza password nel form, quella esistente resta.
        $this->actingAs($gestore)->put('/demo', $this->payload())->assertRedirect(route('demo.index'));
        $this->assertTrue(Hash::check('demo-due-dispositivi', $chiosco->fresh()->password));
    }

    public function test_il_login_prepara_lhotel_generico_se_non_e_personalizzato(): void
    {
        $hotel = $this->hotel();
        $gestore = $this->utente(Profilo::GestoreHotel, $hotel);

        $this->post('/login', [
            'username' => $gestore->username,
            'password' => 'password',
        ])->assertRedirect();

        $hotel->refresh();
        $this->assertSame('Hotel Demo', $hotel->nome);
        $this->assertSame('10:00:00', $hotel->checkout_ora);
        $this->assertStringContainsString('Trattoria del centro', $hotel->istruzioni_ai);
        $this->assertSame(15, $hotel->camere()->count());
    }

    public function test_la_ricerca_compila_la_scheda_da_openstreetmap_e_dal_sito(): void
    {
        Http::fake([
            '*nominatim.openstreetmap.org*' => Http::response([[
                'lat'          => '45.3300',
                'lon'          => '11.7900',
                'category'     => 'tourism',
                'type'         => 'hotel',
                'name'         => 'Hotel Bella',
                'display_name' => 'Hotel Bella, Via Roma 1, Montegrotto Terme',
                'extratags'    => [
                    'website' => 'https://hotel-bella.test',
                    'rooms'   => '28',
                ],
            ]]),
            '*overpass-api.de*' => Http::response([
                'elements' => [
                    [
                        'type' => 'node',
                        'lat'  => 45.3302,
                        'lon'  => 11.7901,
                        'tags' => ['amenity' => 'restaurant', 'name' => 'Trattoria Reale', 'cuisine' => 'italian'],
                    ],
                    [
                        'type' => 'node',
                        'lat'  => 45.3310,
                        'lon'  => 11.7910,
                        'tags' => ['tourism' => 'museum', 'name' => 'Museo delle Terme'],
                    ],
                    [
                        'type' => 'node',
                        'lat'  => 45.3301,
                        'lon'  => 11.7902,
                        'tags' => ['highway' => 'bus_stop', 'name' => 'Terme'],
                    ],
                    [
                        'type' => 'node',
                        'lat'  => 45.3320,
                        'lon'  => 11.7920,
                        'tags' => ['amenity' => 'taxi', 'name' => 'Taxi Terme'],
                    ],
                ],
            ]),
            '*hotel-bella.test*' => Http::response(
                '<html><body>Check-in dalle 14 alle 22. Check-out entro le 11. Colazione dalle 7 alle 10.</body></html>'
            ),
        ]);

        $hotel = $this->hotel();

        $this->actingAs($this->utente(Profilo::GestoreHotel, $hotel))
            ->postJson('/demo/cerca', ['nome' => 'Hotel Bella Montegrotto'])
            ->assertOk()
            ->assertJsonPath('scheda.nome', 'Hotel Bella')
            ->assertJsonPath('scheda.numero_camere', 28)
            ->assertJsonPath('scheda.checkin', 'dalle 14 alle 22')
            ->assertJsonPath('scheda.checkout', 'entro le 11')
            ->assertJsonPath('scheda.colazione', 'dalle 7 alle 10')
            ->assertJsonPath('scheda.ristoranti.0.nome', 'Trattoria Reale')
            ->assertJsonPath('scheda.luoghi.0.nome', 'Museo delle Terme')
            ->assertJsonPath('fonte', 'OpenStreetMap e il sito dell\'hotel');

        $fresco = $hotel->fresh();
        $this->assertSame('Hotel Demo', $fresco->nome);
        $this->assertStringNotContainsString('Trattoria Reale', (string) $fresco->istruzioni_ai);
    }

    public function test_la_ricerca_senza_risultati_non_inventa(): void
    {
        Http::fake([
            '*nominatim.openstreetmap.org*' => Http::response([]),
        ]);

        $hotel = $this->hotel();

        $this->actingAs($this->utente(Profilo::GestoreHotel, $hotel))
            ->postJson('/demo/cerca', ['nome' => 'Albergo Inesistente ZZ'])
            ->assertStatus(422);

        $this->assertSame('Hotel Demo', $hotel->fresh()->nome);
        $this->assertSame('default', $hotel->fresh()->scheda_demo['origine']);
    }
}
