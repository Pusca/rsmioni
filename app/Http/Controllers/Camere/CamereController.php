<?php

namespace App\Http\Controllers\Camere;

use App\Enums\ContestoDocumento;
use App\Http\Controllers\Controller;
use App\Models\Camera;
use App\Models\Chiosco;
use App\Models\Documento;
use App\Models\Hotel;
use App\Services\CameraService;
use App\Services\DocumentoService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class CamereController extends Controller
{
    public function __construct(
        private readonly CameraService    $service,
        private readonly DocumentoService $documentoService,
    ) {}

    // ── Lista ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $camere = Camera::whereIn('hotel_id', $hotelIds)
            ->with('hotel:id,nome')
            ->orderBy('hotel_id')
            ->orderBy('piano')
            ->orderBy('nome')
            ->get();

        $hotels = Hotel::whereIn('id', $hotelIds)->get(['id', 'nome']);

        return Inertia::render('Camere/Index', [
            'camere' => $camere,
            'hotels' => $hotels,
        ]);
    }

    // ── Dettaglio ─────────────────────────────────────────────────────────────

    public function show(Request $request, string $id): Response
    {
        $user   = $request->user();
        $camera = Camera::with(['hotel:id,nome'])->findOrFail($id);

        $this->autorizza($user, $camera);

        $puoCancellare = $this->service->puoCancellare($camera);

        $documenti = Documento::where('contesto_tipo', ContestoDocumento::Camera)
            ->where('contesto_id', $camera->id)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn(Documento $d) => $this->documentoService->serializza($d, $user));

        // Chioschi con stampante — per la stampa remota documenti camera
        $chioschi = Chiosco::where('hotel_id', $camera->hotel_id)
            ->where('attivo', true)
            ->where('has_stampante', true)
            ->get(['id', 'nome']);

        return Inertia::render('Camere/Show', [
            'camera'             => $camera,
            'puoCancellare'      => $puoCancellare,
            'documenti'          => $documenti,
            'puoUploadDocumenti' => true,  // solo gestore accede a questa pagina
            'chioschi'           => $chioschi,
        ]);
    }

    // ── Inserimento ───────────────────────────────────────────────────────────

    public function create(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();
        $hotels   = Hotel::whereIn('id', $hotelIds)->get(['id', 'nome']);

        return Inertia::render('Camere/Create', [
            'hotels' => $hotels,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $validated = $this->validateCamera($request, $hotelIds);

        $camera = Camera::create($validated);

        return redirect()->route('camere.show', $camera->id)
            ->with('success', 'Camera inserita con successo.');
    }

    // ── Modifica ──────────────────────────────────────────────────────────────

    public function edit(Request $request, string $id): Response
    {
        $user   = $request->user();
        $camera = Camera::with('hotel:id,nome')->findOrFail($id);

        $this->autorizza($user, $camera);

        $hotels = Hotel::whereIn('id', $user->hotelIds())->get(['id', 'nome']);

        return Inertia::render('Camere/Edit', [
            'camera' => $camera,
            'hotels' => $hotels,
        ]);
    }

    public function update(Request $request, string $id): RedirectResponse
    {
        $user   = $request->user();
        $camera = Camera::findOrFail($id);

        $this->autorizza($user, $camera);

        $validated = $this->validateCamera($request, $user->hotelIds(), forUpdate: true);

        $camera->update($validated);

        return redirect()->route('camere.show', $camera->id)
            ->with('success', 'Camera aggiornata.');
    }

    // ── Cancellazione ─────────────────────────────────────────────────────────

    public function destroy(Request $request, string $id): RedirectResponse
    {
        $user   = $request->user();
        $camera = Camera::findOrFail($id);

        $this->autorizza($user, $camera);

        if (! $this->service->puoCancellare($camera)) {
            return back()->withErrors([
                'cancellazione' => 'Impossibile eliminare la camera: ha prenotazioni attive o future.',
            ]);
        }

        $camera->delete();

        return redirect()->route('camere.index')
            ->with('success', 'Camera eliminata.');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function autorizza($user, Camera $camera): void
    {
        if (! in_array($camera->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }
    }

    private function validateCamera(Request $request, array $hotelIds, bool $forUpdate = false): array
    {
        $rules = [
            'nome'                     => ['required', 'string', 'max:100'],
            'tipo'                     => ['required', 'string', 'max:100'],
            'piano'                    => ['required', 'integer', 'min:0', 'max:20'],
            'booking_consentito'       => ['boolean'],
            'letti_matrimoniali'       => ['nullable', 'integer', 'min:0', 'max:10'],
            'letti_singoli'            => ['nullable', 'integer', 'min:0', 'max:10'],
            'letti_aggiunti'           => ['nullable', 'integer', 'min:0', 'max:10'],
            'divani_letto_singoli'     => ['nullable', 'integer', 'min:0', 'max:10'],
            'divani_letto_matrimoniali'=> ['nullable', 'integer', 'min:0', 'max:10'],
            'culle'                    => ['nullable', 'integer', 'min:0', 'max:5'],
            'doccia'                   => ['boolean'],
            'vasca'                    => ['boolean'],
            'minibar'                  => ['boolean'],
            'minibar_pieno'            => ['boolean'],
            'aria_condizionata'        => ['boolean'],
            'quadro_elettrico'         => ['nullable', 'string', 'max:500'],
            'codice_chiave'            => ['nullable', 'string', 'max:100'],
            'mq'                       => ['nullable', 'numeric', 'min:0', 'max:9999'],
        ];

        // hotel_id richiesto solo in store
        if (! $forUpdate) {
            $rules['hotel_id'] = ['required', 'uuid', \Illuminate\Validation\Rule::in($hotelIds)];
        }

        return $request->validate($rules);
    }
}
