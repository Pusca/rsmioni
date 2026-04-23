<?php

namespace App\Http\Controllers\Prenotazioni;

use App\Enums\ContestoDocumento;
use App\Enums\Profilo;
use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Services\CameraService;
use App\Services\DocumentoService;
use App\Services\PortineriaService;
use App\Services\PrenotazioneService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

class PrenotazioniController extends Controller
{
    public function __construct(
        private readonly PrenotazioneService $service,
        private readonly CameraService       $cameraService,
        private readonly DocumentoService    $documentoService,
        private readonly PortineriaService   $portineriaService,
    ) {}

    // ── Lista ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $filtri = $request->only([
            'cerca', 'data_dal', 'data_al',
            'stato_pagamento', 'stato_documento',
        ]);

        $paginated = $this->service->query($user, $hotelIds, $filtri)->paginate(25)->withQueryString();

        // Arricchisce ogni item con il flag puoCancellare (calcolato lato backend)
        $paginated->through(function (Prenotazione $pren) use ($user) {
            $pren->puo_cancellare = $this->service->puoCancellare($user, $pren);
            return $pren;
        });

        $hotels = Hotel::whereIn('id', $hotelIds)
            ->get(['id', 'nome', 'overbooking_permesso', 'giorni_visibilita_calendario']);

        return Inertia::render('Prenotazioni/Index', [
            'prenotazioni' => $paginated,
            'hotels'       => $hotels,
            'profilo'      => $user->profilo->value,
            'filtri'       => $filtri,
            'can'          => ['create' => true],
        ]);
    }

    // ── Dettaglio ─────────────────────────────────────────────────────────────

    public function show(Request $request, string $id): Response
    {
        $user = $request->user();
        $pren = Prenotazione::with(['hotel', 'pagamenti.chiosco', 'documenti', 'camere'])->findOrFail($id);

        if (! $this->service->accessoConsentito($user, $pren)) {
            abort(403);
        }

        // Camere disponibili per il periodo della prenotazione (per il selettore UI)
        $camereDisponibili = ($pren->check_in && $pren->check_out)
            ? $this->cameraService->camereConDisponibilita(
                hotelId:               $pren->hotel_id,
                checkIn:               $pren->check_in->toDateString(),
                checkOut:              $pren->check_out->toDateString(),
                escludiPrenotazioneId: $pren->id,
              )
            : collect();

        // Documenti della prenotazione (con puo_cancellare per riga)
        $documenti = Documento::where('contesto_tipo', ContestoDocumento::Prenotazione)
            ->where('contesto_id', $pren->id)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn(Documento $d) => $this->documentoService->serializza($d, $user));

        // Documenti delle camere assegnate — consultazione operativa per receptionist e gestore
        // Il receptionist non accede a /camere/{id} ma consulta i documenti camera
        // nel contesto della prenotazione, come previsto dal flusso operativo RH24.
        $documentiCamere = $pren->camere
            ->map(function (\App\Models\Camera $c) use ($user) {
                $docs = Documento::where('contesto_tipo', \App\Enums\ContestoDocumento::Camera)
                    ->where('contesto_id', $c->id)
                    ->orderBy('created_at', 'desc')
                    ->get()
                    ->map(fn(Documento $d) => $this->documentoService->serializza($d, $user));

                return [
                    'camera_id'   => $c->id,
                    'camera_nome' => $c->nome,
                    'documenti'   => $docs,
                ];
            })
            ->filter(fn($item) => $item['documenti']->isNotEmpty())
            ->values();

        // Chioschi attivi dell'hotel — per acquisizione documento, stampa remota e POS.
        // Ogni chiosco include lo stato runtime corrente (da Cache/Redis) in modo che
        // l'UI possa filtrare il POS solo ai chioschi in stato in_parlato (RH24).
        $chioschi = Chiosco::where('hotel_id', $pren->hotel_id)
            ->where('attivo', true)
            ->get(['id', 'nome', 'has_stampante', 'has_pos', 'tipo_pos'])
            ->map(fn(Chiosco $c) => array_merge($c->toArray(), [
                'stato' => $this->portineriaService->statoChiosco($c->id)->value,
            ]))
            ->values();

        return Inertia::render('Prenotazioni/Show', [
            'prenotazione'        => $pren,
            'profilo'             => $user->profilo->value,
            'puoCancellare'       => $this->service->puoCancellare($user, $pren),
            'motivoCancellazione' => $this->service->motivoNonCancellabile($user, $pren),
            'camereDisponibili'   => $camereDisponibili->values(),
            'documenti'           => $documenti,
            'puoUploadDocumenti'  => true,
            'documentiCamere'     => $documentiCamere,
            'chioschi'            => $chioschi,
        ]);
    }

    // ── Inserimento ───────────────────────────────────────────────────────────

    public function create(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $hotels = Hotel::whereIn('id', $hotelIds)
            ->get(['id', 'nome', 'overbooking_permesso', 'giorni_visibilita_calendario']);

        return Inertia::render('Prenotazioni/Create', [
            'hotels'  => $hotels,
            'profilo' => $user->profilo->value,
            'oggi'    => now()->toDateString(),
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $validated = $request->validate([
            'hotel_id'           => ['required', 'uuid', Rule::in($hotelIds)],
            'codice'             => ['nullable', 'string', 'max:100'],
            'nome'               => ['nullable', 'string', 'max:200'],
            'cognome'            => ['nullable', 'string', 'max:200'],
            'gruppo'             => ['nullable', 'string', 'max:200'],
            'check_in'           => ['required', 'date'],
            'check_out'          => ['required', 'date', 'after:check_in'],
            'pax.adulti'         => ['required', 'integer', 'min:1', 'max:99'],
            'pax.ragazzi'        => ['nullable', 'integer', 'min:0', 'max:99'],
            'pax.bambini'        => ['nullable', 'integer', 'min:0', 'max:99'],
            'tipo_pagamento'     => ['required', Rule::enum(TipoPagamento::class)],
            'documento_identita' => ['required', Rule::enum(StatoDocumentoIdentita::class)],
            'prezzo'             => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'overbooking'        => ['boolean'],
        ], [
            'check_out.after'      => 'Il check-out deve essere successivo al check-in.',
            'pax.adulti.required'  => 'Indicare almeno un adulto.',
            'pax.adulti.min'       => 'Almeno un adulto è obbligatorio.',
        ]);

        $hotel      = Hotel::findOrFail($validated['hotel_id']);
        $overbooking = (bool) ($validated['overbooking'] ?? false);

        if ($overbooking && ! $hotel->overbooking_permesso) {
            return back()->withErrors([
                'overbooking' => 'Overbooking non consentito per questo hotel.',
            ])->withInput();
        }

        $pren = Prenotazione::create([
            'hotel_id'            => $validated['hotel_id'],
            'codice'              => $validated['codice'] ?? null,
            'nome'                => $validated['nome'] ?? null,
            'cognome'             => $validated['cognome'] ?? null,
            'gruppo'              => $validated['gruppo'] ?? null,
            'check_in'            => $validated['check_in'],
            'check_out'           => $validated['check_out'],
            'pax'                 => [
                'adulti'  => (int) ($validated['pax']['adulti'] ?? 1),
                'ragazzi' => (int) ($validated['pax']['ragazzi'] ?? 0),
                'bambini' => (int) ($validated['pax']['bambini'] ?? 0),
            ],
            'tipo_pagamento'      => $validated['tipo_pagamento'],
            'documento_identita'  => $validated['documento_identita'],
            'prezzo'              => $validated['prezzo'] ?? null,
            'overbooking'         => $overbooking,
            'checkin_confermato'  => false,
            'inserito_da'         => $user->id,
            'inserito_da_profilo' => $user->profilo,
        ]);

        return redirect()->route('prenotazioni.show', $pren->id)
            ->with('success', 'Prenotazione inserita con successo.');
    }

    // ── Modifica ──────────────────────────────────────────────────────────────

    public function edit(Request $request, string $id): Response
    {
        $user = $request->user();
        $pren = Prenotazione::with('hotel')->findOrFail($id);

        if (! $this->service->accessoConsentito($user, $pren)) {
            abort(403);
        }

        $hotelIds = $user->hotelIds();
        $hotels   = Hotel::whereIn('id', $hotelIds)
            ->get(['id', 'nome', 'overbooking_permesso', 'giorni_visibilita_calendario']);

        return Inertia::render('Prenotazioni/Edit', [
            'prenotazione' => $pren,
            'hotels'       => $hotels,
            'profilo'      => $user->profilo->value,
            'oggi'         => now()->toDateString(),
        ]);
    }

    public function update(Request $request, string $id): RedirectResponse
    {
        $user = $request->user();
        $pren = Prenotazione::findOrFail($id);

        if (! $this->service->accessoConsentito($user, $pren)) {
            abort(403);
        }

        $validated = $request->validate([
            'codice'             => ['nullable', 'string', 'max:100'],
            'nome'               => ['nullable', 'string', 'max:200'],
            'cognome'            => ['nullable', 'string', 'max:200'],
            'gruppo'             => ['nullable', 'string', 'max:200'],
            'check_in'           => ['required', 'date'],
            'check_out'          => ['required', 'date', 'after:check_in'],
            'pax.adulti'         => ['required', 'integer', 'min:1', 'max:99'],
            'pax.ragazzi'        => ['nullable', 'integer', 'min:0', 'max:99'],
            'pax.bambini'        => ['nullable', 'integer', 'min:0', 'max:99'],
            'tipo_pagamento'     => ['required', Rule::enum(TipoPagamento::class)],
            'documento_identita' => ['required', Rule::enum(StatoDocumentoIdentita::class)],
            'prezzo'             => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'overbooking'        => ['boolean'],
            'checkin_confermato' => ['boolean'],
        ], [
            'check_out.after' => 'Il check-out deve essere successivo al check-in.',
        ]);

        $hotel      = Hotel::findOrFail($pren->hotel_id);
        $overbooking = (bool) ($validated['overbooking'] ?? false);

        if ($overbooking && ! $hotel->overbooking_permesso) {
            return back()->withErrors(['overbooking' => 'Overbooking non consentito.'])->withInput();
        }

        $pren->update([
            'codice'             => $validated['codice'] ?? null,
            'nome'               => $validated['nome'] ?? null,
            'cognome'            => $validated['cognome'] ?? null,
            'gruppo'             => $validated['gruppo'] ?? null,
            'check_in'           => $validated['check_in'],
            'check_out'          => $validated['check_out'],
            'pax'                => [
                'adulti'  => (int) ($validated['pax']['adulti'] ?? 1),
                'ragazzi' => (int) ($validated['pax']['ragazzi'] ?? 0),
                'bambini' => (int) ($validated['pax']['bambini'] ?? 0),
            ],
            'tipo_pagamento'     => $validated['tipo_pagamento'],
            'documento_identita' => $validated['documento_identita'],
            'prezzo'             => $validated['prezzo'] ?? null,
            'overbooking'        => $overbooking,
            'checkin_confermato' => (bool) ($validated['checkin_confermato'] ?? $pren->checkin_confermato),
        ]);

        return redirect()->route('prenotazioni.show', $pren->id)
            ->with('success', 'Prenotazione aggiornata.');
    }

    // ── Cancellazione ─────────────────────────────────────────────────────────

    public function destroy(Request $request, string $id): RedirectResponse
    {
        $user = $request->user();
        $pren = Prenotazione::findOrFail($id);

        if (! $this->service->accessoConsentito($user, $pren)) {
            abort(403);
        }

        if (! $this->service->puoCancellare($user, $pren)) {
            $motivo = $this->service->motivoNonCancellabile($user, $pren)
                ?? 'Cancellazione non consentita.';
            return back()->withErrors(['cancellazione' => $motivo]);
        }

        $pren->delete();

        return redirect()->route('prenotazioni.index')
            ->with('success', 'Prenotazione cancellata.');
    }
}
