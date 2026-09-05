<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use App\Services\PrenotazioneService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Elenco prenotazioni: viste rapide (arrivi/in casa/partenze/prossimi/passate)
 * e ordinamenti (check-in vicino/lontano, recenti, cognome).
 */
class PrenotazioniOrdinamentoTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private User $gestore;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo('2026-09-10 12:00:00');

        $this->hotel = Hotel::create([
            'id' => Str::uuid()->toString(), 'nome' => 'Hotel Test', 'indirizzo' => 'Via Test 1',
            'chioschi_concorrenti_max' => 1, 'checkout_libero' => false, 'checkout_ora' => '10:00:00',
            'lingua_default' => 'it', 'lingue_abilitate' => ['it'], 'suoneria_attiva' => true,
            'volume_suoneria' => 80, 'numero_massimo_pax' => 4, 'campi_pax_obbligatori' => ['nome', 'cognome'],
        ]);
        $this->gestore = User::create([
            'id' => Str::uuid()->toString(), 'username' => 'gest_' . Str::random(6), 'email' => Str::random(8) . '@t.local',
            'password' => Hash::make('password'), 'profilo' => Profilo::GestoreHotel, 'ip_whitelist' => [], 'attivo' => true,
        ]);
        $this->gestore->hotels()->attach($this->hotel->id);

        // codice => [check_in, check_out, cognome, created_at]
        foreach ([
            'PASSATA' => ['2026-09-01', '2026-09-03', 'Zeta',  '2026-08-01 10:00:00'],
            'INCASA'  => ['2026-09-08', '2026-09-12', 'Bianchi', '2026-08-02 10:00:00'],
            'ARRIVO'  => ['2026-09-10', '2026-09-13', 'Rossi', '2026-09-09 10:00:00'],
            'PARTE'   => ['2026-09-07', '2026-09-10', 'Alfa',  '2026-08-03 10:00:00'],
            'FUTURA'  => ['2026-09-20', '2026-09-22', 'Verdi', '2026-09-10 09:00:00'],
        ] as $codice => [$ci, $co, $cognome, $creata]) {
            $p = Prenotazione::create([
                'id' => Str::uuid()->toString(), 'hotel_id' => $this->hotel->id, 'codice' => $codice,
                'check_in' => $ci, 'check_out' => $co, 'pax' => ['adulti' => 1, 'ragazzi' => 0, 'bambini' => 0],
                'nome' => 'N', 'cognome' => $cognome, 'tipo_pagamento' => 'da_pagare', 'documento_identita' => 'da_acquisire',
                'inserito_da_profilo' => 'gestore_hotel',
            ]);
            // created_at non è fillable: si forza dopo la creazione
            $p->forceFill(['created_at' => $creata, 'updated_at' => $creata])->saveQuietly();
        }
    }

    private function codici(array $filtri): array
    {
        return app(PrenotazioneService::class)->query($this->gestore, [$this->hotel->id], $filtri)->pluck('codice')->all();
    }

    public function test_viste_rapide(): void
    {
        $this->assertSame(['ARRIVO'], $this->codici(['vista' => 'arrivi_oggi']));
        $this->assertSame(['INCASA', 'ARRIVO'], $this->codici(['vista' => 'in_casa']));
        $this->assertSame(['PARTE'], $this->codici(['vista' => 'partenze_oggi']));
        $this->assertSame(['ARRIVO', 'FUTURA'], $this->codici(['vista' => 'prossimi']));
        $this->assertSame(['PASSATA'], $this->codici(['vista' => 'passate']));
        $this->assertCount(5, $this->codici([]));
    }

    public function test_ordinamenti(): void
    {
        // Default lista completa: check-in dal più lontano nel futuro
        $this->assertSame(['FUTURA', 'ARRIVO', 'INCASA', 'PARTE', 'PASSATA'], $this->codici([]));
        $this->assertSame(['PASSATA', 'PARTE', 'INCASA', 'ARRIVO', 'FUTURA'], $this->codici(['ordina' => 'check_in_asc']));
        $this->assertSame(['FUTURA', 'ARRIVO', 'PARTE', 'INCASA', 'PASSATA'], $this->codici(['ordina' => 'recenti']));
        $this->assertSame(['PARTE', 'INCASA', 'ARRIVO', 'FUTURA', 'PASSATA'], $this->codici(['ordina' => 'cognome']));
        // Ordinamento sconosciuto → default
        $this->assertSame(['FUTURA', 'ARRIVO', 'INCASA', 'PARTE', 'PASSATA'], $this->codici(['ordina' => 'boh']));
    }

    public function test_la_lista_web_accetta_vista_e_ordina(): void
    {
        $this->actingAs($this->gestore)
            ->get('/prenotazioni?vista=prossimi&ordina=check_in_asc')
            ->assertOk()
            ->assertInertia(fn ($page) => $page
                ->component('Prenotazioni/Index')
                ->where('filtri.vista', 'prossimi')
                ->where('filtri.ordina', 'check_in_asc')
                ->where('prenotazioni.data.0.codice', 'ARRIVO')
                ->where('prenotazioni.data.1.codice', 'FUTURA'));
    }
}
