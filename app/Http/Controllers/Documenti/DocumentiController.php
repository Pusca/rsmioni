<?php

namespace App\Http\Controllers\Documenti;

use App\Enums\ContestoDocumento;
use App\Http\Controllers\Controller;
use App\Mail\DocumentoLinkMail;
use App\Models\Camera;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use App\Services\DocumentoService;
use App\Services\LinkTemporaneaService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DocumentiController extends Controller
{
    public function __construct(
        private readonly DocumentoService      $service,
        private readonly LinkTemporaneaService $linkService,
    ) {}

    // ── Upload ────────────────────────────────────────────────────────────────

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'contesto_tipo'  => ['required', 'in:prenotazione,camera,regola'],
            'contesto_id'    => ['required', 'uuid'],
            'file'           => ['required', 'file', 'mimes:pdf,png,jpg,jpeg', 'max:20480'],
            'titolo'         => ['nullable', 'string', 'max:255'],
            'lingua'         => ['nullable', 'string', 'size:2'],
            'tipo_documento' => ['nullable', 'string', 'max:100'],
        ]);

        $utente       = $request->user();
        $contestoTipo = ContestoDocumento::from($validated['contesto_tipo']);

        // Receptionist: può caricare solo su prenotazioni
        if ($utente->profilo->value === 'receptionist' && $contestoTipo !== ContestoDocumento::Prenotazione) {
            abort(403, 'Il Receptionist può caricare documenti solo sulle prenotazioni.');
        }

        // Verifica che il contesto appartenga a un hotel accessibile all'utente
        $this->verificaOwnership($utente, $contestoTipo, $validated['contesto_id']);

        $this->service->upload(
            file:              $request->file('file'),
            contestoTipo:      $contestoTipo,
            contestoId:        $validated['contesto_id'],
            inseritoDa:        $utente->id,
            inseritoDaProfilo: $utente->profilo->value,
            titolo:            $validated['titolo'] ?? null,
            lingua:            $validated['lingua'] ?? null,
            tipoDocumento:     $validated['tipo_documento'] ?? null,
        );

        return back()->with('success', 'Documento caricato con successo.');
    }

    // ── Visualizzazione inline ────────────────────────────────────────────────

    public function show(Request $request, Documento $documento): StreamedResponse
    {
        $this->verificaOwnershipDocumento($request->user(), $documento);

        $nome = ($documento->titolo ?? 'documento') . '.' . $documento->estensione;

        return response()->streamDownload(
            function () use ($documento) {
                echo \Illuminate\Support\Facades\Storage::disk('local')->get($documento->storage_path);
            },
            $nome,
            [
                'Content-Type'        => $this->service->mimeType($documento->estensione),
                'Content-Disposition' => 'inline; filename="' . addslashes($nome) . '"',
            ]
        );
    }

    // ── Download attachment ───────────────────────────────────────────────────

    public function download(Request $request, Documento $documento): StreamedResponse
    {
        $this->verificaOwnershipDocumento($request->user(), $documento);

        $nome = ($documento->titolo ?? 'documento') . '.' . $documento->estensione;

        return response()->streamDownload(
            function () use ($documento) {
                echo \Illuminate\Support\Facades\Storage::disk('local')->get($documento->storage_path);
            },
            $nome,
            ['Content-Type' => $this->service->mimeType($documento->estensione)]
        );
    }

    // ── Eliminazione ─────────────────────────────────────────────────────────

    public function destroy(Request $request, Documento $documento): RedirectResponse
    {
        $utente = $request->user();

        // Ownership prima dei permessi di cancellazione
        $this->verificaOwnershipDocumento($utente, $documento);

        if (! $this->service->puoCancellare($utente, $documento)) {
            return back()->with('error', 'Non sei autorizzato a eliminare questo documento.');
        }

        $this->service->elimina($documento);

        return back()->with('success', 'Documento eliminato.');
    }

    // ── Invio via email con link temporaneo ───────────────────────────────────

    public function invia(Request $request, Documento $documento): JsonResponse
    {
        $utente = $request->user();

        // Ownership: il documento deve appartenere a un hotel accessibile
        $this->verificaOwnershipDocumento($utente, $documento);

        // Permesso invio
        if (! $this->service->puoInviare($utente, $documento)) {
            return response()->json(['errore' => 'Non sei autorizzato a inviare questo documento.'], 403);
        }

        $validated = $request->validate([
            'email' => ['required', 'email', 'max:255'],
            'testo' => ['nullable', 'string', 'max:1000'],
        ]);

        $link  = $this->linkService->crea($documento, $validated['email'], $validated['testo'] ?? null);
        $hotel = $link->hotel_id ? Hotel::find($link->hotel_id) : null;

        Mail::to($validated['email'])->send(new DocumentoLinkMail($link, $documento, $hotel));

        return response()->json(['ok' => true]);
    }

    // ── Authorization helpers ─────────────────────────────────────────────────

    /**
     * Verifica che il contesto (prenotazione/camera) appartenga a un hotel
     * effettivamente accessibile all'utente.
     * Le regole di piattaforma non hanno vincolo hotel.
     */
    private function verificaOwnership(User $utente, ContestoDocumento $tipo, string $contestoId): void
    {
        if ($tipo === ContestoDocumento::Regola) {
            // Regole: accesso garantito dal middleware role:gestore_hotel,receptionist
            return;
        }

        $hotelId = $this->resolveHotelId($tipo, $contestoId);

        if ($hotelId === null || ! in_array($hotelId, $utente->hotelIds(), true)) {
            abort(403, 'Il contesto non appartiene a un hotel accessibile.');
        }
    }

    /** Wrapper per un documento già caricato. */
    private function verificaOwnershipDocumento(User $utente, Documento $documento): void
    {
        $this->verificaOwnership($utente, $documento->contesto_tipo, $documento->contesto_id);
    }

    /**
     * Risolve l'hotel_id dal contesto del documento.
     * Restituisce null per i contesti platform-level (Regola).
     */
    private function resolveHotelId(ContestoDocumento $tipo, string $contestoId): ?string
    {
        return match ($tipo) {
            ContestoDocumento::Prenotazione => Prenotazione::find($contestoId)?->hotel_id,
            ContestoDocumento::Camera       => Camera::find($contestoId)?->hotel_id,
            ContestoDocumento::Regola       => null,
        };
    }
}
