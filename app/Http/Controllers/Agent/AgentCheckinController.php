<?php

namespace App\Http\Controllers\Agent;

use App\Enums\ContestoDocumento;
use App\Enums\EsitoPOS;
use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use App\Enums\TipoPOS;
use App\Http\Controllers\Controller;
use App\Models\Camera;
use App\Models\Chiosco;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\Pagamento;
use App\Models\Prenotazione;
use App\Services\CameraService;
use App\Services\PortineriaService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

/**
 * API di dominio per il worker AI (self check-in vocale) — docs/09 FASE 2.
 *
 * Autenticate con AgentServiceAuth (segreto condiviso). Ogni azione è legata
 * a una sessione WebRTC viva: l'agent non può toccare nulla fuori dalla
 * chiamata in corso. L'hotel di destinazione viene SEMPRE dalla sessione,
 * mai dal payload: l'AI non ha "poteri speciali".
 *
 *   POST /agent/form          — registra incrementalmente i campi raccolti a voce
 *   POST /agent/prenotazione  — valida il form e crea la prenotazione REALE
 *   POST /agent/termina       — chiude la sessione e riporta il chiosco Idle
 */
class AgentCheckinController extends Controller
{
    public function __construct(
        private readonly WebRtcSessionService $sessioni,
        private readonly PortineriaService    $portineria,
        private readonly CameraService        $camere,
    ) {}

    /** Risolve la sessione dal payload; null se non esiste/scaduta. */
    private function sessione(Request $request): ?array
    {
        $request->validate(['session_id' => ['required', 'string']]);
        $sessione = $this->sessioni->trova($request->session_id);

        return ($sessione && ($sessione['gestita_da'] ?? '') === 'ai') ? $sessione : null;
    }

    /**
     * Audit trail del receptionist AI (docs/09 §6): una riga per azione con
     * sessione, chiosco, esito e dettagli. Canale dedicato ai_audit.
     */
    private function audit(string $azione, Request $request, ?array $sessione, bool $ok, array $dettagli = []): void
    {
        Log::channel('ai_audit')->info($azione, [
            'esito'      => $ok ? 'ok' : 'rifiutata',
            'session_id' => $request->input('session_id'),
            'chiosco_id' => $sessione['chiosco_id'] ?? null,
            'hotel_id'   => $sessione['hotel_id'] ?? null,
            ...$dettagli,
        ]);
    }

    public function aggiornaForm(Request $request): JsonResponse
    {
        if (! $this->sessione($request)) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $validated = $request->validate([
            'nome'      => ['nullable', 'string', 'max:200'],
            'cognome'   => ['nullable', 'string', 'max:200'],
            'check_in'  => ['nullable', 'date_format:Y-m-d'],
            'check_out' => ['nullable', 'date_format:Y-m-d'],
            'adulti'    => ['nullable', 'integer', 'min:1', 'max:10'],
            'ragazzi'   => ['nullable', 'integer', 'min:0', 'max:10'],
            'bambini'   => ['nullable', 'integer', 'min:0', 'max:10'],
        ]);

        // Coerenza date sul form RISULTANTE (nuovi campi + già raccolti):
        // errori actionable che l'agent può rigirare all'ospite a voce.
        $attuale  = $this->sessioni->form($request->session_id);
        $checkIn  = $validated['check_in']  ?? $attuale['check_in']  ?? null;
        $checkOut = $validated['check_out'] ?? $attuale['check_out'] ?? null;

        if ($checkIn && Carbon::parse($checkIn)->lt(now()->startOfDay())) {
            $this->audit('form.aggiorna', $request, $this->sessione($request), false, ['motivo' => 'check_in nel passato', 'check_in' => $checkIn]);
            return response()->json(['error' => "La data di arrivo {$checkIn} è nel passato: chiedi conferma della data all'ospite."], 422);
        }
        if ($checkIn && $checkOut && ! Carbon::parse($checkOut)->gt(Carbon::parse($checkIn))) {
            $this->audit('form.aggiorna', $request, $this->sessione($request), false, ['motivo' => 'check_out non successivo', 'check_in' => $checkIn, 'check_out' => $checkOut]);
            return response()->json(['error' => 'La partenza deve essere successiva all\'arrivo: verifica le date con l\'ospite.'], 422);
        }
        if ($checkIn && $checkOut && Carbon::parse($checkIn)->diffInDays(Carbon::parse($checkOut)) > 60) {
            $this->audit('form.aggiorna', $request, $this->sessione($request), false, ['motivo' => 'soggiorno oltre 60 notti']);
            return response()->json(['error' => 'Soggiorno superiore a 60 notti: caso da gestire con il receptionist.'], 422);
        }

        $form = $this->sessioni->aggiornaForm($request->session_id, $validated);
        $this->audit('form.aggiorna', $request, $this->sessione($request), true, ['campi' => array_keys(array_filter($validated, fn ($v) => $v !== null))]);

        return response()->json(['ok' => true, 'form' => $form]);
    }

    public function creaPrenotazione(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $form = $this->sessioni->form($request->session_id);

        // Idempotente: se la prenotazione è già stata creata in questa sessione
        // (es. retry dell'agent), restituisce quella esistente.
        if (! empty($form['prenotazione_id'])) {
            $esistente = Prenotazione::find($form['prenotazione_id']);
            if ($esistente) {
                return response()->json([
                    'ok'              => true,
                    'prenotazione_id' => $esistente->id,
                    'codice'          => $esistente->codice,
                ]);
            }
        }

        // Walk-in disabilitato (docs/11): il master delle prenotazioni è un
        // altro PMS, creare qui una prenotazione rischia la doppia vendita.
        if (! $this->walkinAbilitato($sessione)) {
            $this->audit('prenotazione.crea', $request, $sessione, false, ['motivo' => 'walk-in disabilitato']);
            return response()->json([
                'error' => 'In questo hotel le nuove prenotazioni non si fanno al chiosco. '
                         . 'Se la ricerca non trova la prenotazione, invita l\'ospite a rivolgersi al receptionist.',
            ], 403);
        }

        // Servono le date; il nome vocale è un segnaposto (A29): quello
        // ufficiale arriva dal documento e aggiorna la prenotazione dopo.
        $mancanti = array_filter(
            ['check_in', 'check_out'],
            fn (string $c) => empty($form[$c]),
        );
        if ($mancanti) {
            $this->audit('prenotazione.crea', $request, $sessione, false, ['motivo' => 'dati mancanti', 'mancanti' => array_values($mancanti)]);
            return response()->json([
                'error'    => 'Dati mancanti: ' . implode(', ', $mancanti) . '. Chiedili all\'ospite.',
                'mancanti' => array_values($mancanti),
            ], 422);
        }

        $checkIn  = Carbon::parse($form['check_in']);
        $checkOut = Carbon::parse($form['check_out']);
        if (! $checkOut->gt($checkIn)) {
            return response()->json(['error' => 'La data di partenza deve essere successiva all\'arrivo.'], 422);
        }

        $pren = Prenotazione::create([
            'hotel_id'            => $sessione['hotel_id'],
            'codice'              => 'AI-' . strtoupper(Str::random(6)),
            'nome'                => ! empty($form['nome']) ? $form['nome'] : 'Ospite',
            'cognome'             => ! empty($form['cognome']) ? $form['cognome'] : '(da documento)',
            'check_in'            => $checkIn->toDateString(),
            'check_out'           => $checkOut->toDateString(),
            'pax'                 => [
                'adulti'  => (int) ($form['adulti'] ?? 1),
                'ragazzi' => (int) ($form['ragazzi'] ?? 0),
                'bambini' => (int) ($form['bambini'] ?? 0),
            ],
            'tipo_pagamento'      => TipoPagamento::DaPagare,
            'documento_identita'  => StatoDocumentoIdentita::DaAcquisire,
            'overbooking'         => false,
            'checkin_confermato'  => false,
            'inserito_da'         => $sessione['receptionist_id'], // account chiosco della sessione
            'inserito_da_profilo' => Profilo::Chiosco,
        ]);

        // Aggancia la prenotazione alla sessione per i passi successivi
        // (assegnazione camera, acquisizione documento).
        $this->sessioni->aggiornaForm($request->session_id, ['prenotazione_id' => $pren->id]);
        $this->audit('prenotazione.crea', $request, $sessione, true, ['prenotazione_id' => $pren->id, 'codice' => $pren->codice]);

        return response()->json([
            'ok'              => true,
            'prenotazione_id' => $pren->id,
            'codice'          => $pren->codice,
        ]);
    }

    /** Posti letto effettivi di una camera (adulti+ragazzi). */
    // ── Corrispondenza nominativi da voce ───────────────────────────────────

    /** "Pöplawska  Natalia" → "poplawska natalia" (solo lettere ASCII e spazi singoli). */
    private function normalizzaNome(string $s): string
    {
        $s = mb_strtolower(Str::ascii(trim($s)));
        $s = preg_replace('/[^a-z ]+/', ' ', $s);
        return trim(preg_replace('/\s+/', ' ', $s));
    }

    /** "#AI-ABC 123" → "aiabc123". */
    private function normalizzaCodice(string $s): string
    {
        return preg_replace('/[^a-z0-9]+/', '', mb_strtolower($s));
    }

    /**
     * Quanto il nominativo detto a voce somiglia alla prenotazione (0..1).
     * Confronta con cognome, nome, "nome cognome", "cognome nome" e prenotante:
     * uguaglianza → 1; un token uguale (≥3 lettere) → 0.95; distanza di
     * edit piccola (STT: "Poplaska" per "Poplawska") → 0.85; similarità
     * di caratteri ≥ 0.8 → quel valore.
     */
    private function somiglianzaNominativo(string $detto, Prenotazione $p): float
    {
        $campi = array_filter([
            $this->normalizzaNome((string) $p->cognome),
            $this->normalizzaNome((string) $p->nome),
            $this->normalizzaNome($p->nome . ' ' . $p->cognome),
            $this->normalizzaNome($p->cognome . ' ' . $p->nome),
            $this->normalizzaNome((string) $p->prenotante),
        ]);

        $tokDetto = array_filter(explode(' ', $detto), fn ($t) => strlen($t) >= 3);
        $migliore = 0.0;

        foreach ($campi as $campo) {
            if ($campo === $detto) {
                return 1.0;
            }
            $tokCampo = array_filter(explode(' ', $campo), fn ($t) => strlen($t) >= 3);
            foreach ($tokDetto as $td) {
                foreach ($tokCampo as $tc) {
                    if ($td === $tc) {
                        $migliore = max($migliore, 0.95);
                    } elseif (strlen($td) >= 5 && levenshtein($td, $tc) <= (strlen($td) >= 8 ? 2 : 1)) {
                        $migliore = max($migliore, 0.85);
                    }
                }
            }
            if ($detto !== '' && strlen($detto) >= 5 && levenshtein($detto, $campo) <= 2) {
                $migliore = max($migliore, 0.85);
            }
            similar_text($detto, $campo, $percento);
            if ($percento / 100 >= 0.8) {
                $migliore = max($migliore, $percento / 100);
            }
        }

        return $migliore;
    }

    /** Impostazione hotel (docs/11): l'AI può creare prenotazioni walk-in? */
    private function walkinAbilitato(array $sessione): bool
    {
        return (bool) (Hotel::find($sessione['hotel_id'])?->ai_walkin_abilitato ?? true);
    }

    private function postiCamera(Camera $c): int
    {
        return 2 * (int) $c->letti_matrimoniali + (int) $c->letti_singoli
            + (int) $c->letti_aggiunti + (int) $c->divani_letto_singoli
            + 2 * (int) $c->divani_letto_matrimoniali;
    }

    /** Camere libere per un intervallo di date nell'hotel della sessione. */
    private function camereLibereDate(string $hotelId, string $checkIn, string $checkOut)
    {
        return $this->camere->camereConDisponibilita(
            hotelId:  $hotelId,
            checkIn:  $checkIn,
            checkOut: $checkOut,
        )->filter(fn ($c) => $c->disponibile);
    }

    /** Camere libere per le date della prenotazione della sessione. */
    private function camereLibere(Prenotazione $pren)
    {
        return $this->camereLibereDate(
            $pren->hotel_id,
            $pren->check_in->toDateString(),
            $pren->check_out->toDateString(),
        );
    }

    /**
     * Elenca le camere libere raggruppate per equivalenza (tipo, prezzo,
     * descrizione, capienza): l'agent propone UNA opzione per gruppo — tre
     * matrimoniali identiche sono una sola scelta.
     *
     * Funziona PRIMA del salvataggio (date e ospiti dal form della sessione):
     * la disponibilità si verifica prima di creare la prenotazione.
     */
    public function listaCamere(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $form = $this->sessioni->form($request->session_id);
        $pren = ! empty($form['prenotazione_id']) ? Prenotazione::find($form['prenotazione_id']) : null;

        if ($pren) {
            $checkIn  = $pren->check_in;
            $checkOut = $pren->check_out;
            $adulti   = (int) ($pren->pax['adulti'] ?? 1);
            $ragazzi  = (int) ($pren->pax['ragazzi'] ?? 0);
        } else {
            if (! $this->walkinAbilitato($sessione)) {
                return response()->json([
                    'error' => 'In questo hotel le camere in vendita le propone solo il receptionist: '
                             . 'senza una prenotazione esistente invita l\'ospite a rivolgersi a lui.',
                ], 403);
            }
            if (empty($form['check_in']) || empty($form['check_out'])) {
                return response()->json(['error' => 'Servono prima le date di arrivo e partenza: chiedile all\'ospite.'], 422);
            }
            $checkIn  = Carbon::parse($form['check_in']);
            $checkOut = Carbon::parse($form['check_out']);
            $adulti   = (int) ($form['adulti'] ?? 1);
            $ragazzi  = (int) ($form['ragazzi'] ?? 0);
        }

        $notti  = max(1, (int) $checkIn->diffInDays($checkOut));
        $ospiti = $adulti + $ragazzi;

        $opzioni = $this->camereLibereDate($sessione['hotel_id'], $checkIn->toDateString(), $checkOut->toDateString())
            ->groupBy(fn (Camera $c) => implode('|', [
                $c->tipo, (string) $c->prezzo_notte, (string) $c->descrizione, $this->postiCamera($c),
            ]))
            ->map(function ($gruppo) use ($notti, $ospiti) {
                /** @var Camera $c */
                $c = $gruppo->first();
                $dotazioni = array_keys(array_filter([
                    'doccia'            => $c->doccia,
                    'vasca'             => $c->vasca,
                    'minibar'           => $c->minibar,
                    'aria condizionata' => $c->aria_condizionata,
                ]));
                return [
                    'camera_id'     => $c->id,
                    'nome'          => $c->nome,
                    'tipo'          => $c->tipo,
                    'piano'         => $c->piano,
                    'posti'         => $this->postiCamera($c),
                    'capienza_ok'   => $this->postiCamera($c) >= $ospiti,
                    'prezzo_notte'  => $c->prezzo_notte !== null ? (float) $c->prezzo_notte : null,
                    'prezzo_totale' => $c->prezzo_notte !== null ? round((float) $c->prezzo_notte * $notti, 2) : null,
                    'descrizione'   => $c->descrizione,
                    'dotazioni'     => $dotazioni,
                    'quante_simili' => $gruppo->count(),
                ];
            })
            ->sortBy([['capienza_ok', 'desc'], ['prezzo_notte', 'asc']])
            ->values();

        $this->audit('camere.lista', $request, $sessione, true, ['prenotazione_id' => $pren?->id, 'opzioni' => $opzioni->count()]);

        return response()->json(['ok' => true, 'notti' => $notti, 'opzioni' => $opzioni]);
    }

    /**
     * Assegna una camera alla prenotazione salvata. Con `camera_id` assegna
     * la camera scelta dall'ospite (da listaCamere); senza, sceglie in
     * automatico la prima libera con capienza sufficiente (fallback storico).
     */
    public function assegnaCamera(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $validated = $request->validate(['camera_id' => ['nullable', 'uuid']]);

        $form = $this->sessioni->form($request->session_id);
        $pren = ! empty($form['prenotazione_id']) ? Prenotazione::find($form['prenotazione_id']) : null;
        if (! $pren) {
            return response()->json(['error' => 'Prenotazione non ancora salvata: salvala prima di assegnare la camera.'], 422);
        }

        // Già assegnata (retry): restituisce l'esistente
        $giaAssegnata = $pren->camere()->first();
        if ($giaAssegnata) {
            return response()->json([
                'ok'     => true,
                'camera' => ['nome' => $giaAssegnata->nome, 'piano' => $giaAssegnata->piano, 'tipo' => $giaAssegnata->tipo],
            ]);
        }

        $disponibili = $this->camereLibere($pren);

        if (! empty($validated['camera_id'])) {
            // Scelta esplicita dell'ospite: deve essere tra le libere dell'hotel
            $libera = $disponibili->first(fn (Camera $c) => $c->id === $validated['camera_id']);
            if (! $libera) {
                $this->audit('camera.assegna', $request, $sessione, false, ['motivo' => 'camera scelta non disponibile', 'camera_id' => $validated['camera_id']]);
                return response()->json([
                    'error' => 'La camera scelta non è più disponibile: riproponi le opzioni con la lista camere.',
                ], 409);
            }
        } else {
            // Fallback automatico: capienza sufficiente, altrimenti qualsiasi libera
            $ospiti = (int) ($pren->pax['adulti'] ?? 1) + (int) ($pren->pax['ragazzi'] ?? 0);
            $libera = $disponibili->first(fn (Camera $c) => $this->postiCamera($c) >= $ospiti)
                ?? $disponibili->first();
        }

        if (! $libera) {
            $this->audit('camera.assegna', $request, $sessione, false, ['motivo' => 'nessuna disponibile', 'prenotazione_id' => $pren->id]);
            return response()->json([
                'error' => 'Nessuna camera libera per queste date. Informa l\'ospite e invitalo a rivolgersi al receptionist.',
            ], 409);
        }

        // Passa dal servizio: transazione + lock sulla camera, così una
        // prenotazione inserita dal receptionist nello stesso istante non
        // finisce sulla stessa camera.
        try {
            $this->camere->assegna($pren, [$libera->id]);
        } catch (\DomainException $e) {
            $this->audit('camera.assegna', $request, $sessione, false, ['motivo' => 'conflitto concorrente', 'camera_id' => $libera->id]);
            return response()->json([
                'error' => 'La camera è appena stata occupata da un\'altra prenotazione: riproponi le opzioni con la lista camere.',
            ], 409);
        }

        // Valorizza il prezzo del soggiorno dalla camera assegnata (prezzo_notte
        // × notti): senza prezzo il pagamento POS del flusso AI non può partire.
        if ($pren->prezzo === null && $libera->prezzo_notte !== null) {
            $notti = max(1, (int) Carbon::parse($pren->check_in)->diffInDays(Carbon::parse($pren->check_out)));
            $pren->update(['prezzo' => (float) $libera->prezzo_notte * $notti]);
        }

        $this->audit('camera.assegna', $request, $sessione, true, ['prenotazione_id' => $pren->id, 'camera' => $libera->nome, 'prezzo' => $pren->prezzo]);

        return response()->json([
            'ok'     => true,
            'camera' => ['nome' => $libera->nome, 'piano' => $libera->piano, 'tipo' => $libera->tipo],
        ]);
    }

    /**
     * Avvia l'acquisizione del documento sul chiosco: la schermata kiosk
     * mostra il riquadro guida e l'ospite scatta fronte e retro. Riusa il
     * flusso esistente (cache acquisizione_pendente + upload kiosk).
     */
    public function avviaAcquisizione(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $form = $this->sessioni->form($request->session_id);
        if (empty($form['prenotazione_id'])) {
            return response()->json(['error' => 'Prenotazione non ancora salvata: salvala prima del documento.'], 422);
        }

        Cache::put("acquisizione_pendente:chiosco_{$sessione['chiosco_id']}", [
            'prenotazione_id' => $form['prenotazione_id'],
            'titolo'          => 'Documento d\'identità',
            'lingua'          => $request->input('lingua', 'it'),
            'tipo_documento'  => 'carta_identita',
            'fronte_retro'    => true,
        ], 300);
        Cache::forget("acquisizione_completata:chiosco_{$sessione['chiosco_id']}");
        $this->audit('acquisizione.avvia', $request, $sessione, true, ['prenotazione_id' => $form['prenotazione_id']]);

        return response()->json(['ok' => true]);
    }

    /**
     * Stato dell'acquisizione avviata: pendente | completata | nessuna.
     * L'agent la interroga per sapere quando l'ospite ha finito gli scatti.
     */
    public function statoAcquisizione(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $chioscoId = $sessione['chiosco_id'];
        if (Cache::get("acquisizione_completata:chiosco_{$chioscoId}")) {
            $stato = 'completata';
        } elseif (Cache::get("acquisizione_pendente:chiosco_{$chioscoId}")) {
            $stato = 'pendente';
        } else {
            $stato = 'nessuna';
        }

        return response()->json(['ok' => true, 'stato' => $stato]);
    }

    /**
     * Restituisce (base64) l'immagine FRONTE dell'ultimo documento acquisito
     * per la prenotazione della sessione: il worker la passa alla vision AI
     * per leggere il nome ufficiale dell'intestatario.
     */
    public function documentoImmagine(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $form = $this->sessioni->form($request->session_id);
        if (empty($form['prenotazione_id'])) {
            return response()->json(['error' => 'Prenotazione non ancora salvata.'], 422);
        }

        $doc = \App\Models\Documento::where('contesto_tipo', \App\Enums\ContestoDocumento::Prenotazione)
            ->where('contesto_id', $form['prenotazione_id'])
            ->whereIn('estensione', ['jpg', 'jpeg', 'png'])
            ->where('titolo', 'like', '%fronte%')
            ->orderByDesc('created_at')
            ->first()
            ?? \App\Models\Documento::where('contesto_tipo', \App\Enums\ContestoDocumento::Prenotazione)
                ->where('contesto_id', $form['prenotazione_id'])
                ->whereIn('estensione', ['jpg', 'jpeg', 'png'])
                ->orderByDesc('created_at')
                ->first();

        if (! $doc || ! \Illuminate\Support\Facades\Storage::disk('local')->exists($doc->storage_path)) {
            return response()->json(['error' => 'Nessun documento acquisito trovato per questa prenotazione.'], 404);
        }

        $contenuto = \Illuminate\Support\Facades\Storage::disk('local')->get($doc->storage_path);
        if (strlen($contenuto) > 8 * 1024 * 1024) {
            return response()->json(['error' => 'Immagine documento troppo grande per la lettura automatica.'], 422);
        }

        $this->audit('documento.immagine', $request, $sessione, true, ['documento_id' => $doc->id]);

        return response()->json([
            'ok'       => true,
            'mime'     => $doc->estensione === 'png' ? 'image/png' : 'image/jpeg',
            'immagine' => base64_encode($contenuto),
        ]);
    }

    /**
     * Aggiorna nome e cognome dell'intestatario sulla prenotazione della
     * sessione, con i dati LETTI DAL DOCUMENTO (fonte ufficiale: sostituisce
     * il nome sentito a voce, usato solo come segnaposto).
     */
    public function aggiornaIntestatario(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $validated = $request->validate([
            'nome'    => ['required', 'string', 'max:200'],
            'cognome' => ['required', 'string', 'max:200'],
        ]);

        $form = $this->sessioni->form($request->session_id);
        $pren = ! empty($form['prenotazione_id']) ? Prenotazione::find($form['prenotazione_id']) : null;
        if (! $pren) {
            return response()->json(['error' => 'Prenotazione non ancora salvata.'], 422);
        }

        $pren->update(['nome' => $validated['nome'], 'cognome' => $validated['cognome']]);
        $this->sessioni->aggiornaForm($request->session_id, $validated);
        $this->audit('intestatario.aggiorna', $request, $sessione, true, ['prenotazione_id' => $pren->id]);

        return response()->json(['ok' => true, 'nome' => $pren->nome, 'cognome' => $pren->cognome]);
    }

    /**
     * Cerca la prenotazione dell'ospite per il check-out (cognome e/o codice),
     * limitata all'hotel della sessione e al soggiorno in corso.
     */
    public function cercaPrenotazione(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $validated = $request->validate([
            'cognome' => ['nullable', 'string', 'max:200'],
            'nome'    => ['nullable', 'string', 'max:200'],
            'codice'  => ['nullable', 'string', 'max:100'],
            'ambito'  => ['nullable', 'string', 'in:soggiorno,arrivo'],
        ]);
        if (empty($validated['cognome']) && empty($validated['codice']) && empty($validated['nome'])) {
            return response()->json(['error' => 'Serve almeno il cognome o il codice prenotazione.'], 422);
        }

        $ambito = $validated['ambito'] ?? 'soggiorno';
        $oggi   = now()->toDateString();
        $q      = Prenotazione::where('hotel_id', $sessione['hotel_id']);

        if ($ambito === 'arrivo') {
            // Check-in: arrivi non ancora confermati. Finestra larga (ieri → +30
            // giorni) per RICONOSCERE la prenotazione anche se l'ospite arriva
            // in un giorno diverso; l'aggancio automatico vale solo ieri..domani.
            $q->where('checkin_confermato', false)
              ->whereBetween('check_in', [now()->subDay()->toDateString(), now()->addDays(30)->toDateString()]);
        } else {
            // Check-out: soggiorno in corso
            $q->where('check_out', '>=', $oggi)->where('check_in', '<=', $oggi);
        }

        $candidati = $q->orderBy('check_in')->limit(400)->get();

        // Corrispondenza tollerante: la voce arriva da uno speech-to-text
        // (accenti persi, lettere doppie, nome e cognome invertiti, cognome
        // del prenotante invece dell'ospite). Si confronta il detto con
        // cognome, nome, "nome cognome" e prenotante di ogni candidata.
        $detto  = $this->normalizzaNome(($validated['cognome'] ?? '') . ' ' . ($validated['nome'] ?? ''));
        $codice = ! empty($validated['codice']) ? $this->normalizzaCodice($validated['codice']) : null;

        $trovate = $candidati
            ->map(function (Prenotazione $p) use ($detto, $codice) {
                $punteggio = 0.0;
                if ($codice !== null && $this->normalizzaCodice((string) $p->codice) === $codice) {
                    $punteggio = 1.0;
                } elseif ($detto !== '') {
                    $punteggio = $this->somiglianzaNominativo($detto, $p);
                }
                return ['pren' => $p, 'punteggio' => $punteggio];
            })
            ->filter(fn ($m) => $m['punteggio'] >= 0.8)
            ->sortByDesc('punteggio')
            ->values();

        if ($trovate->isEmpty()) {
            $this->audit('prenotazione.cerca', $request, $sessione, false, [
                'motivo' => 'nessuna corrispondenza', 'ambito' => $ambito, 'detto' => $detto, 'codice' => $codice,
                'candidate' => $candidati->count(),
            ]);
            return response()->json([
                'ok'    => false,
                'error' => $ambito === 'arrivo'
                    ? 'Nessuna prenotazione in arrivo con questo nome. Chiedi di ripetere il cognome (o il nome di chi ha prenotato, o il codice) oppure indirizza al receptionist.'
                    : 'Nessuna prenotazione in corso trovata con questi dati. Chiedi di ripetere il cognome (o il codice) oppure indirizza al receptionist.',
            ], 404);
        }

        // Arrivo: preferisci chi è atteso ieri..domani; le altre sono "fuori finestra"
        $limiteFinestra = now()->addDay()->toDateString();
        $inFinestra = $ambito === 'arrivo'
            ? $trovate->filter(fn ($m) => $m['pren']->check_in->toDateString() <= $limiteFinestra)->values()
            : $trovate;

        // Ambiguità reale: più prenotazioni di persone diverse con lo stesso punteggio massimo
        $scelte = $inFinestra->isNotEmpty() ? $inFinestra : $trovate;
        $top    = $scelte->first()['punteggio'];
        $pari   = $scelte->filter(fn ($m) => $m['punteggio'] >= $top - 0.001)
            ->unique(fn ($m) => $this->normalizzaNome($m['pren']->nome . ' ' . $m['pren']->cognome) . '|' . $m['pren']->check_in->toDateString());
        if ($pari->count() > 1 && $codice === null) {
            $this->audit('prenotazione.cerca', $request, $sessione, false, ['motivo' => 'ambigua', 'detto' => $detto, 'quante' => $pari->count()]);
            return response()->json([
                'ok'    => false,
                'error' => 'Più prenotazioni corrispondono a questo nome: chiedi il codice prenotazione, o il nome di chi ha prenotato, per distinguerle.',
            ], 409);
        }

        $pren          = $scelte->first()['pren'];
        $fuoriFinestra = $ambito === 'arrivo' && $inFinestra->isEmpty();

        if ($fuoriFinestra) {
            // Prenotazione riconosciuta ma l'arrivo è previsto un altro giorno:
            // non si aggancia (il check-in anticipato lo decide il receptionist).
            $this->audit('prenotazione.cerca', $request, $sessione, false, [
                'motivo' => 'fuori finestra', 'prenotazione_id' => $pren->id, 'check_in' => $pren->check_in->toDateString(),
            ]);
            return response()->json([
                'ok'             => false,
                'fuori_finestra' => true,
                'check_in'       => $pren->check_in->toDateString(),
                'cognome'        => $pren->cognome,
                'error'          => 'Prenotazione trovata ma l\'arrivo è previsto il ' . $pren->check_in->format('d/m/Y')
                                  . ', non oggi. Diglielo con calma e passa al receptionist: decide lui se anticipare il check-in.',
            ], 409);
        }

        $this->sessioni->aggiornaForm($request->session_id, ['prenotazione_id' => $pren->id]);
        $this->audit('prenotazione.cerca', $request, $sessione, true, ['prenotazione_id' => $pren->id, 'codice' => $pren->codice]);

        $pagato = $pren->tipo_pagamento === TipoPagamento::GiaPagato
            || $pren->pagamenti()->where('esito', EsitoPOS::Ok)->exists();

        return response()->json([
            'ok'           => true,
            'prenotazione' => [
                'codice'     => $pren->codice,
                'nome'       => $pren->nome,
                'cognome'    => $pren->cognome,
                'prenotante' => $pren->prenotante,
                'check_in'   => $pren->check_in->toDateString(),
                'check_out' => $pren->check_out->toDateString(),
                'camera'    => $pren->camere()->first()?->nome,
                'prezzo'    => $pren->prezzo !== null ? (float) $pren->prezzo : null,
                'pagato'    => $pagato,
                'pax'       => $pren->pax,
                'checkin_confermato' => (bool) $pren->checkin_confermato,
                'documenti' => Documento::where('contesto_tipo', ContestoDocumento::Prenotazione)
                    ->where('contesto_id', $pren->id)->count(),
            ],
        ]);
    }

    /**
     * Avvia il pagamento POS sul chiosco per la prenotazione della sessione
     * (riusa il flusso esistente: record Pagamento + cache pagamento_pendente
     * letta dal polling del chiosco, che mostra la schermata POS).
     */
    public function avviaPagamento(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $form = $this->sessioni->form($request->session_id);
        $pren = ! empty($form['prenotazione_id']) ? Prenotazione::find($form['prenotazione_id']) : null;
        if (! $pren) {
            return response()->json(['error' => 'Prima trova la prenotazione con cerca_prenotazione.'], 422);
        }

        $chiosco = Chiosco::find($sessione['chiosco_id']);
        if (! $chiosco?->has_pos) {
            return response()->json(['error' => 'Questo chiosco non ha un POS: indirizza l\'ospite al receptionist per il pagamento.'], 422);
        }
        if ($pren->prezzo === null || (float) $pren->prezzo <= 0) {
            return response()->json(['error' => 'Prezzo non impostato sulla prenotazione: indirizza al receptionist.'], 422);
        }

        $pagamento = Pagamento::create([
            'prenotazione_id'   => $pren->id,
            'chiosco_id'        => $chiosco->id,
            'importo_richiesto' => (float) $pren->prezzo,
            'valuta'            => 'EUR',
            'causale'           => 'Check-out ' . ($pren->codice ?? ''),
            'esito'             => EsitoPOS::Pending,
            'tipo_pos'          => $chiosco->tipo_pos ?? TipoPOS::Ingenico,
            'eseguito_da'       => $sessione['receptionist_id'],
        ]);

        Cache::forget("pagamento_pendente:chiosco_{$chiosco->id}");
        Cache::put("pagamento_pendente:chiosco_{$chiosco->id}", [
            'pagamento_id'    => $pagamento->id,
            'prenotazione_id' => $pren->id,
            'importo'         => (float) $pren->prezzo,
            'valuta'          => 'EUR',
            'causale'         => 'Check-out ' . ($pren->codice ?? ''),
            'tipo_pos'        => $chiosco->tipo_pos?->value ?? 'ingenico',
            'triggered_da'    => $sessione['receptionist_id'],
            'created_at'      => now()->toISOString(),
        ], 600);

        $this->sessioni->aggiornaForm($request->session_id, ['pagamento_id' => $pagamento->id]);
        $this->audit('pagamento.avvia', $request, $sessione, true, ['pagamento_id' => $pagamento->id, 'importo' => (float) $pren->prezzo]);

        return response()->json(['ok' => true, 'importo' => (float) $pren->prezzo]);
    }

    /**
     * Stato del pagamento POS avviato: pending | ok | ko | annullato.
     * Su esito OK marca la prenotazione come pagata.
     */
    public function statoPagamento(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            return response()->json(['error' => 'Sessione AI non trovata o scaduta.'], 404);
        }

        $form      = $this->sessioni->form($request->session_id);
        $pagamento = ! empty($form['pagamento_id']) ? Pagamento::find($form['pagamento_id']) : null;
        if (! $pagamento) {
            return response()->json(['error' => 'Nessun pagamento avviato in questa sessione.'], 422);
        }

        if ($pagamento->esito === EsitoPOS::Ok) {
            Prenotazione::where('id', $pagamento->prenotazione_id)
                ->update(['tipo_pagamento' => TipoPagamento::GiaPagato]);
            $this->audit('pagamento.esito', $request, $sessione, true, ['pagamento_id' => $pagamento->id, 'stato' => 'ok']);
        }

        return response()->json(['ok' => true, 'stato' => $pagamento->esito->value]);
    }

    public function termina(Request $request): JsonResponse
    {
        $sessione = $this->sessione($request);
        if (! $sessione) {
            // Già chiusa (es. dall'ospite o dal receptionist): idempotente
            return response()->json(['ok' => true]);
        }

        // Conferma automatica del check-in nel gestionale: come farebbe il
        // receptionist con "Conferma check-in", ma solo se il self check-in
        // ha davvero prodotto i documenti (almeno uno agganciato). Idempotente.
        $form = $this->sessioni->form($request->session_id);
        if (! empty($form['prenotazione_id'])) {
            $pren = Prenotazione::find($form['prenotazione_id']);
            if ($pren && ! $pren->checkin_confermato) {
                $haDocumenti = Documento::where('contesto_tipo', ContestoDocumento::Prenotazione)
                    ->where('contesto_id', $pren->id)->exists();
                if ($haDocumenti) {
                    $pren->update(['checkin_confermato' => true, 'checkin_confermato_at' => now()]);
                    $this->audit('checkin.conferma', $request, $sessione, true, ['prenotazione_id' => $pren->id]);
                }
            }
        }

        $this->sessioni->chiudi($request->session_id);

        $chiosco = Chiosco::find($sessione['chiosco_id']);
        if ($chiosco) {
            $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);
        }
        $this->audit('sessione.termina', $request, $sessione, true);

        return response()->json(['ok' => true]);
    }
}
