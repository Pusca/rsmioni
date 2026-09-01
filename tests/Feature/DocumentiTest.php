<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Mail\DocumentoLinkMail;
use App\Models\Camera;
use App\Models\Chiosco;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\LinkTemporaneo;
use App\Models\Prenotazione;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Documenti: upload, viewer/download con ownership hotel, cancellazione,
 * invio via link temporaneo (LinkTemporaneoController) e acquisizione
 * documento dal chiosco (KioskAcquisizioneController).
 */
class DocumentiTest extends TestCase
{
    use RefreshDatabase;

    private Hotel $hotel;
    private Hotel $altroHotel;
    private Chiosco $chiosco;
    private Prenotazione $prenotazione;
    private Camera $camera;
    private User $gestore;
    private User $receptionist;
    private User $receptionistAltroHotel;
    private User $accountChiosco;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('local');
        Cache::flush();

        $this->hotel      = $this->creaHotel('Hotel Alfa');
        $this->altroHotel = $this->creaHotel('Hotel Beta');

        $this->chiosco = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->hotel->id,
            'nome'          => 'Chiosco 1',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => false,
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

        $this->camera = Camera::create([
            'id'                 => Str::uuid()->toString(),
            'hotel_id'           => $this->hotel->id,
            'nome'               => 'Camera 101',
            'tipo'               => 'Doppia',
            'piano'              => 1,
            'booking_consentito' => true,
            'letti_singoli'      => 0,
            'letti_matrimoniali' => 1,
        ]);

        $this->gestore                = $this->creaUtente(Profilo::GestoreHotel, $this->hotel);
        $this->receptionist           = $this->creaUtente(Profilo::Receptionist, $this->hotel);
        $this->receptionistAltroHotel = $this->creaUtente(Profilo::Receptionist, $this->altroHotel);
        $this->accountChiosco         = $this->creaUtente(Profilo::Chiosco, $this->hotel);
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

    /** Documento già caricato sulla prenotazione dell'Hotel Alfa. */
    private function creaDocumento(Profilo $inseritoDaProfilo = Profilo::Receptionist): Documento
    {
        $path = "documenti/prenotazione/{$this->prenotazione->id}/" . Str::uuid() . '.pdf';
        Storage::disk('local')->put($path, '%PDF-1.4 contenuto di test');

        return Documento::create([
            'id'                  => Str::uuid()->toString(),
            'contesto_tipo'       => 'prenotazione',
            'contesto_id'         => $this->prenotazione->id,
            'titolo'              => 'Documento test',
            'estensione'          => 'pdf',
            'storage_path'        => $path,
            'inserito_da'         => $this->receptionist->id,
            'inserito_da_profilo' => $inseritoDaProfilo->value,
        ]);
    }

    private function creaLink(Documento $documento, array $override = []): LinkTemporaneo
    {
        return LinkTemporaneo::create([
            'id'                 => Str::uuid()->toString(),
            'documento_id'       => $documento->id,
            'token'              => Str::random(48),
            'destinatario_email' => 'ospite@test.local',
            'hotel_id'           => $this->hotel->id,
            'scadenza_at'        => now()->addHours(48),
            'usato'              => false,
            ...$override,
        ]);
    }

    // ── Upload ─────────────────────────────────────────────────────────────

    public function test_receptionist_carica_un_pdf_sulla_prenotazione(): void
    {
        $this->actingAs($this->receptionist)
            ->from('/prenotazioni')
            ->post('/documenti', [
                'contesto_tipo' => 'prenotazione',
                'contesto_id'   => $this->prenotazione->id,
                'file'          => UploadedFile::fake()->create('carta-identita.pdf', 200, 'application/pdf'),
                'titolo'        => 'Carta identità',
            ])
            ->assertRedirect('/prenotazioni')
            ->assertSessionHas('success');

        $documento = Documento::first();
        $this->assertNotNull($documento);
        $this->assertSame('Carta identità', $documento->titolo);
        $this->assertSame('pdf', $documento->estensione);
        $this->assertSame($this->prenotazione->id, $documento->contesto_id);
        Storage::disk('local')->assertExists($documento->storage_path);
    }

    public function test_upload_rifiuta_estensioni_non_consentite(): void
    {
        $this->actingAs($this->receptionist)
            ->from('/prenotazioni')
            ->post('/documenti', [
                'contesto_tipo' => 'prenotazione',
                'contesto_id'   => $this->prenotazione->id,
                'file'          => UploadedFile::fake()->create('script.txt', 10, 'text/plain'),
            ])
            ->assertRedirect('/prenotazioni')
            ->assertSessionHasErrors('file');

        $this->assertSame(0, Documento::count());
    }

    public function test_upload_rifiuta_file_oltre_20_mb(): void
    {
        $this->actingAs($this->receptionist)
            ->from('/prenotazioni')
            ->post('/documenti', [
                'contesto_tipo' => 'prenotazione',
                'contesto_id'   => $this->prenotazione->id,
                'file'          => UploadedFile::fake()->create('enorme.pdf', 20481, 'application/pdf'),
            ])
            ->assertRedirect('/prenotazioni')
            ->assertSessionHasErrors('file');
    }

    public function test_receptionist_non_carica_su_contesto_camera(): void
    {
        $this->actingAs($this->receptionist)
            ->post('/documenti', [
                'contesto_tipo' => 'camera',
                'contesto_id'   => $this->camera->id,
                'file'          => UploadedFile::fake()->create('planimetria.pdf', 100, 'application/pdf'),
            ])
            ->assertForbidden();
    }

    public function test_gestore_carica_su_contesto_camera(): void
    {
        $this->actingAs($this->gestore)
            ->from('/camere')
            ->post('/documenti', [
                'contesto_tipo' => 'camera',
                'contesto_id'   => $this->camera->id,
                'file'          => UploadedFile::fake()->create('planimetria.pdf', 100, 'application/pdf'),
            ])
            ->assertRedirect('/camere')
            ->assertSessionHas('success');

        $this->assertDatabaseHas('documenti', [
            'contesto_tipo' => 'camera',
            'contesto_id'   => $this->camera->id,
        ]);
    }

    public function test_upload_su_prenotazione_di_altro_hotel_rifiutato(): void
    {
        $this->actingAs($this->receptionistAltroHotel)
            ->post('/documenti', [
                'contesto_tipo' => 'prenotazione',
                'contesto_id'   => $this->prenotazione->id,
                'file'          => UploadedFile::fake()->create('doc.pdf', 100, 'application/pdf'),
            ])
            ->assertForbidden();
    }

    // ── Viewer / download con ownership ────────────────────────────────────

    public function test_show_e_download_per_utente_dello_stesso_hotel(): void
    {
        $documento = $this->creaDocumento();

        $this->actingAs($this->receptionist)
            ->get("/documenti/{$documento->id}")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');

        $this->actingAs($this->gestore)
            ->get("/documenti/{$documento->id}/download")
            ->assertOk();
    }

    public function test_utente_di_altro_hotel_non_accede_al_documento(): void
    {
        $documento = $this->creaDocumento();

        $this->actingAs($this->receptionistAltroHotel)
            ->get("/documenti/{$documento->id}")
            ->assertForbidden();

        $this->actingAs($this->receptionistAltroHotel)
            ->get("/documenti/{$documento->id}/download")
            ->assertForbidden();
    }

    public function test_documento_inesistente_ritorna_404(): void
    {
        $this->actingAs($this->receptionist)
            ->get('/documenti/' . Str::uuid()->toString())
            ->assertNotFound();
    }

    // ── Cancellazione ──────────────────────────────────────────────────────

    public function test_gestore_cancella_qualsiasi_documento(): void
    {
        $documento = $this->creaDocumento(inseritoDaProfilo: Profilo::Receptionist);
        $path      = $documento->storage_path;

        $this->actingAs($this->gestore)
            ->from('/prenotazioni')
            ->delete("/documenti/{$documento->id}")
            ->assertRedirect('/prenotazioni')
            ->assertSessionHas('success');

        $this->assertDatabaseMissing('documenti', ['id' => $documento->id]);
        Storage::disk('local')->assertMissing($path);
    }

    public function test_receptionist_cancella_documento_proprio_su_prenotazione(): void
    {
        $documento = $this->creaDocumento(inseritoDaProfilo: Profilo::Receptionist);

        $this->actingAs($this->receptionist)
            ->from('/prenotazioni')
            ->delete("/documenti/{$documento->id}")
            ->assertRedirect('/prenotazioni')
            ->assertSessionHas('success');

        $this->assertDatabaseMissing('documenti', ['id' => $documento->id]);
    }

    public function test_receptionist_non_cancella_documento_del_gestore(): void
    {
        $documento = $this->creaDocumento(inseritoDaProfilo: Profilo::GestoreHotel);

        // Comportamento attuale: nessun 403, redirect back con flash di errore
        $this->actingAs($this->receptionist)
            ->from('/prenotazioni')
            ->delete("/documenti/{$documento->id}")
            ->assertRedirect('/prenotazioni')
            ->assertSessionHas('error');

        $this->assertDatabaseHas('documenti', ['id' => $documento->id]);
    }

    public function test_utente_di_altro_hotel_non_cancella_il_documento(): void
    {
        $documento = $this->creaDocumento();

        $this->actingAs($this->receptionistAltroHotel)
            ->delete("/documenti/{$documento->id}")
            ->assertForbidden();
    }

    // ── Invio via link temporaneo ──────────────────────────────────────────

    public function test_invio_documento_crea_link_e_spedisce_email(): void
    {
        Mail::fake();
        $documento = $this->creaDocumento();

        $this->actingAs($this->receptionist)
            ->postJson("/documenti/{$documento->id}/invia", [
                'email' => 'ospite@test.local',
                'testo' => 'Ecco il suo documento',
            ])
            ->assertOk()
            ->assertJsonPath('ok', true);

        $link = LinkTemporaneo::where('documento_id', $documento->id)->first();
        $this->assertNotNull($link);
        $this->assertSame(48, strlen($link->token));
        $this->assertSame('ospite@test.local', $link->destinatario_email);
        $this->assertSame($this->hotel->id, $link->hotel_id);
        $this->assertFalse($link->usato);
        // TTL 48 ore dalla creazione
        $this->assertTrue($link->scadenza_at->between(now()->addHours(47), now()->addHours(49)));

        Mail::assertSent(DocumentoLinkMail::class, fn ($mail) => $mail->hasTo('ospite@test.local'));
    }

    public function test_invio_richiede_email_valida(): void
    {
        Mail::fake();
        $documento = $this->creaDocumento();

        $this->actingAs($this->receptionist)
            ->postJson("/documenti/{$documento->id}/invia", ['email' => 'non-una-email'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');

        Mail::assertNothingSent();
    }

    // ── Accesso pubblico via token ─────────────────────────────────────────

    public function test_link_valido_serve_il_documento(): void
    {
        $documento = $this->creaDocumento();
        $link      = $this->creaLink($documento);

        $this->get("/doc/{$link->token}")
            ->assertOk()
            ->assertHeader('Content-Type', 'application/pdf');
    }

    public function test_link_scaduto_ritorna_410(): void
    {
        $documento = $this->creaDocumento();
        $link      = $this->creaLink($documento, ['scadenza_at' => now()->subHour()]);

        $this->get("/doc/{$link->token}")->assertStatus(410);
    }

    public function test_token_inesistente_ritorna_404(): void
    {
        $this->get('/doc/' . Str::random(48))->assertNotFound();
    }

    public function test_link_marcato_usato_ritorna_410(): void
    {
        $documento = $this->creaDocumento();
        $link      = $this->creaLink($documento, ['usato' => true]);

        $this->get("/doc/{$link->token}")->assertStatus(410);
    }

    public function test_primo_accesso_marca_il_link_e_resta_valido_nella_finestra_di_grazia(): void
    {
        $documento = $this->creaDocumento();
        $link      = $this->creaLink($documento);

        $this->get("/doc/{$link->token}")->assertOk();

        $link->refresh();
        $this->assertTrue($link->usato);
        $this->assertNotNull($link->primo_accesso_at);

        // Il viewer PDF / il browser possono richiedere di nuovo il file subito dopo
        $this->get("/doc/{$link->token}")->assertOk();
    }

    public function test_link_chiuso_dopo_la_finestra_di_grazia(): void
    {
        $documento = $this->creaDocumento();
        $link      = $this->creaLink($documento);

        $this->get("/doc/{$link->token}")->assertOk();

        $this->travel(LinkTemporaneo::GRAZIA_DOPO_PRIMO_ACCESSO_MINUTI + 1)->minutes();

        $this->get("/doc/{$link->token}")->assertStatus(410);
    }

    public function test_link_scaduto_non_viene_marcato_come_aperto(): void
    {
        $documento = $this->creaDocumento();
        $link      = $this->creaLink($documento, ['scadenza_at' => now()->subHour()]);

        $this->get("/doc/{$link->token}")->assertStatus(410);

        $this->assertNull($link->fresh()->primo_accesso_at);
    }

    public function test_link_valido_ma_file_mancante_ritorna_404(): void
    {
        $documento = $this->creaDocumento();
        Storage::disk('local')->delete($documento->storage_path);
        $link = $this->creaLink($documento);

        $this->get("/doc/{$link->token}")->assertNotFound();
    }

    // ── Acquisizione dal kiosk ─────────────────────────────────────────────

    public function test_flusso_completo_di_acquisizione_dal_chiosco(): void
    {
        // 1. Il receptionist innesca l'acquisizione
        $this->actingAs($this->receptionist)
            ->postJson('/acquisizioni', [
                'chiosco_id'      => $this->chiosco->id,
                'prenotazione_id' => $this->prenotazione->id,
                'titolo'          => 'Carta identità',
                'tipo_documento'  => 'carta_identita',
            ])
            ->assertOk();

        // 2. Il chiosco vede la richiesta pendente
        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->getJson('/kiosk/acquisizione-pendente')
            ->assertOk()
            ->assertJsonPath('pendente', true)
            ->assertJsonPath('prenotazione_id', $this->prenotazione->id)
            ->assertJsonPath('titolo', 'Carta identità');

        // 3. Il chiosco carica l'immagine acquisita
        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/acquisizioni', [
                'file' => UploadedFile::fake()->create('scatto.jpg', 500, 'image/jpeg'),
            ])
            ->assertOk();

        $documento = Documento::where('contesto_id', $this->prenotazione->id)->first();
        $this->assertNotNull($documento);
        $this->assertSame('Carta identità', $documento->titolo);
        $this->assertSame(Profilo::Chiosco, $documento->inserito_da_profilo);
        Storage::disk('local')->assertExists($documento->storage_path);

        // 4. Il polling del receptionist segnala il completamento
        $this->actingAs($this->receptionist)
            ->getJson("/acquisizioni/{$this->chiosco->id}/stato")
            ->assertOk()
            ->assertJsonPath('pendente', false)
            ->assertJsonPath('completata', true);
    }

    public function test_acquisizione_kiosk_senza_sessione_chiosco_rifiutata(): void
    {
        $this->actingAs($this->accountChiosco)
            ->postJson('/kiosk/acquisizioni', [
                'file' => UploadedFile::fake()->create('scatto.jpg', 100, 'image/jpeg'),
            ])
            ->assertStatus(422);
    }

    public function test_acquisizione_kiosk_senza_richiesta_pendente_rifiutata(): void
    {
        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->postJson('/kiosk/acquisizioni', [
                'file' => UploadedFile::fake()->create('scatto.jpg', 100, 'image/jpeg'),
            ])
            ->assertStatus(422);
    }

    public function test_acquisizione_su_chiosco_di_altro_hotel_rifiutata(): void
    {
        $chioscoBeta = Chiosco::create([
            'id'            => Str::uuid()->toString(),
            'hotel_id'      => $this->altroHotel->id,
            'nome'          => 'Chiosco Beta',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => false,
            'has_stampante' => false,
            'attivo'        => true,
        ]);

        $this->actingAs($this->receptionist)
            ->postJson('/acquisizioni', [
                'chiosco_id'      => $chioscoBeta->id,
                'prenotazione_id' => $this->prenotazione->id,
            ])
            ->assertForbidden();
    }

    public function test_annullamento_acquisizione_dal_kiosk(): void
    {
        $this->actingAs($this->receptionist)
            ->postJson('/acquisizioni', [
                'chiosco_id'      => $this->chiosco->id,
                'prenotazione_id' => $this->prenotazione->id,
            ])
            ->assertOk();

        $this->actingAs($this->accountChiosco)
            ->withSession(['chiosco_id' => $this->chiosco->id])
            ->deleteJson('/kiosk/acquisizioni')
            ->assertOk();

        $this->actingAs($this->receptionist)
            ->getJson("/acquisizioni/{$this->chiosco->id}/stato")
            ->assertOk()
            ->assertJsonPath('pendente', false)
            ->assertJsonPath('completata', false);
    }
}
