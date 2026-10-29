<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Modifica di una prenotazione dal form: codice chiave e stato pagamento
 * devono salvarsi anche su una prenotazione creata per oggi.
 */
class PrenotazioniModificaTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;

    protected function setUp(): void
    {
        parent::setUp();
        $this->hotel = Hotel::create([
            'id' => Str::uuid()->toString(), 'nome' => 'Hotel Test', 'indirizzo' => 'Via Test 1',
            'chioschi_concorrenti_max' => 1, 'checkout_libero' => false, 'checkout_ora' => '10:00:00',
            'lingua_default' => 'it', 'lingue_abilitate' => ['it'], 'suoneria_attiva' => true,
            'volume_suoneria' => 80, 'numero_massimo_pax' => 4, 'campi_pax_obbligatori' => ['nome', 'cognome'],
        ]);
    }

    private function utente(Profilo $profilo): User
    {
        $u = User::create([
            'id' => Str::uuid()->toString(), 'username' => $profilo->value.'_'.Str::random(4),
            'email' => Str::random(8).'@test.local', 'password' => Hash::make('password'),
            'profilo' => $profilo, 'ip_whitelist' => [], 'attivo' => true,
        ]);
        $u->hotels()->attach($this->hotel->id);

        return $u;
    }

    private function payload(array $extra = []): array
    {
        return array_replace([
            'codice' => null, 'codice_chiave' => null, 'nome' => 'Mario', 'cognome' => 'Rossi', 'gruppo' => null,
            'check_in' => now()->toDateString(), 'check_out' => now()->addDay()->toDateString(),
            'pax' => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
            'tipo_pagamento' => 'da_pagare', 'documento_identita' => 'da_acquisire',
            'prezzo' => null, 'overbooking' => false,
        ], $extra);
    }

    public function test_il_gestore_aggiunge_il_codice_chiave_e_segna_pagato_su_una_prenotazione_di_oggi(): void
    {
        $gestore = $this->utente(Profilo::GestoreHotel);

        $this->actingAs($gestore)
            ->post('/prenotazioni', $this->payload(['hotel_id' => $this->hotel->id]))
            ->assertSessionHasNoErrors();
        $pren = Prenotazione::firstOrFail();

        $this->actingAs($gestore)
            ->patch("/prenotazioni/{$pren->id}", $this->payload(['codice_chiave' => 'K-12']))
            ->assertSessionHasNoErrors()
            ->assertRedirect("/prenotazioni/{$pren->id}");
        $this->assertSame('K-12', $pren->fresh()->codice_chiave);

        $this->actingAs($gestore)
            ->patch("/prenotazioni/{$pren->id}", $this->payload(['codice_chiave' => 'K-12', 'tipo_pagamento' => 'gia_pagato']))
            ->assertSessionHasNoErrors();
        $this->assertSame(TipoPagamento::GiaPagato, $pren->fresh()->tipo_pagamento);

        // Dopo «pagato» la prenotazione resta modificabile
        $this->actingAs($gestore)
            ->patch("/prenotazioni/{$pren->id}", $this->payload(['codice_chiave' => 'K-13', 'tipo_pagamento' => 'gia_pagato', 'prezzo' => 120]))
            ->assertSessionHasNoErrors();
        $fresco = $pren->fresh();
        $this->assertSame('K-13', $fresco->codice_chiave);
        $this->assertSame(StatoDocumentoIdentita::DaAcquisire, $fresco->documento_identita);
    }

    public function test_anche_il_receptionist_modifica(): void
    {
        $gestore = $this->utente(Profilo::GestoreHotel);
        $this->actingAs($gestore)->post('/prenotazioni', $this->payload(['hotel_id' => $this->hotel->id]));
        $pren = Prenotazione::firstOrFail();

        $this->actingAs($this->utente(Profilo::Receptionist))
            ->patch("/prenotazioni/{$pren->id}", $this->payload(['codice_chiave' => 'K-7']))
            ->assertSessionHasNoErrors();
        $this->assertSame('K-7', $pren->fresh()->codice_chiave);
    }
}
