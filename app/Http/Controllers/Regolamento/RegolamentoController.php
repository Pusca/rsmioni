<?php

namespace App\Http\Controllers\Regolamento;

use App\Enums\ContestoDocumento;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\Regola;
use App\Models\ValorizzazioneRegola;
use App\Services\DocumentoService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Gestione del modulo Regolamento.
 *
 * Ruoli:
 *   - Gestore Hotel  : lettura + valorizzazione testo
 *   - Receptionist   : sola lettura (knowledge base per supporto cliente)
 *   - Receptionist Lite: escluso da middleware
 *
 * Architettura:
 *   - Le regole (Regola) sono template di piattaforma — nessun CRUD su di esse
 *   - La valorizzazione (ValorizzazioneRegola) è per-hotel, per-lingua
 *   - Multilingua: si gestiscono tutte le lingue abilitate sull'hotel
 */
class RegolamentoController extends Controller
{
    public function __construct(private readonly DocumentoService $documentoService) {}

    // ── Lista ─────────────────────────────────────────────────────────────────

    public function index(Request $request): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        // Hotel selezionato (querystring ?hotel_id=... oppure primo disponibile)
        $hotelId = $request->get('hotel_id');
        if (! $hotelId || ! in_array($hotelId, $hotelIds, true)) {
            $hotelId = $hotelIds[0] ?? null;
        }

        $hotels = Hotel::whereIn('id', $hotelIds)->get(['id', 'nome', 'lingue_abilitate']);
        $hotel  = $hotels->firstWhere('id', $hotelId);

        // Tutte le regole di piattaforma
        $regole = Regola::orderBy('categoria')->orderBy('ordine')->get();

        // Valorizzazioni per questo hotel in lingua IT (per colonna "stato")
        $valorizzazioniIt = $hotelId
            ? ValorizzazioneRegola::where('hotel_id', $hotelId)
                ->where('lingua', 'it')
                ->pluck('testo', 'regola_id')
            : collect();

        // Arricchisce ogni regola con stato valorizzazione
        $regole = $regole->map(function (Regola $r) use ($valorizzazioniIt) {
            $testo = $valorizzazioniIt->get($r->id);
            return [
                'id'         => $r->id,
                'codice'     => $r->codice,
                'categoria'  => $r->categoria->value,
                'ordine'     => $r->ordine,
                'testo_it'   => $testo,
                'valorizzata'=> ! empty($testo),
            ];
        });

        return Inertia::render('Regolamento/Index', [
            'regole'   => $regole,
            'hotels'   => $hotels,
            'hotel_id' => $hotelId,
            'profilo'  => $user->profilo->value,
        ]);
    }

    // ── Dettaglio ─────────────────────────────────────────────────────────────

    public function show(Request $request, string $regolaId): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();
        $hotelId  = $request->get('hotel_id');
        if (! $hotelId || ! in_array($hotelId, $hotelIds, true)) {
            $hotelId = $hotelIds[0] ?? null;
        }

        $regola = Regola::findOrFail($regolaId);
        $hotel  = $hotelId ? Hotel::find($hotelId) : null;
        $lingue = $hotel?->lingue_abilitate ?? ['it'];

        // Contenuto per ogni lingua abilitata
        $contenuti = collect($lingue)->mapWithKeys(function (string $lingua) use ($regola, $hotelId) {
            $val = $hotelId
                ? ValorizzazioneRegola::where('regola_id', $regola->id)
                    ->where('hotel_id', $hotelId)
                    ->where('lingua', $lingua)
                    ->first()
                : null;
            return [$lingua => $val?->testo];
        });

        $documenti = Documento::where('contesto_tipo', ContestoDocumento::Regola)
            ->where('contesto_id', $regola->id)
            ->orderBy('created_at', 'desc')
            ->get()
            ->map(fn(Documento $d) => $this->documentoService->serializza($d, $user));

        // Chioschi con stampante — per la stampa remota documenti regolamento
        $chioschi = $hotelId
            ? Chiosco::where('hotel_id', $hotelId)
                ->where('attivo', true)
                ->where('has_stampante', true)
                ->get(['id', 'nome'])
            : collect();

        return Inertia::render('Regolamento/Show', [
            'regola'             => [
                'id'        => $regola->id,
                'codice'    => $regola->codice,
                'categoria' => $regola->categoria->value,
                'ordine'    => $regola->ordine,
            ],
            'contenuti'          => $contenuti,
            'lingue_hotel'       => $lingue,
            'hotel'              => $hotel ? ['id' => $hotel->id, 'nome' => $hotel->nome] : null,
            'hotel_id'           => $hotelId,
            'profilo'            => $user->profilo->value,
            'documenti'          => $documenti,
            'puoUploadDocumenti' => $user->profilo->value === 'gestore_hotel',
            'chioschi'           => $chioschi,
        ]);
    }

    // ── Modifica ──────────────────────────────────────────────────────────────

    public function edit(Request $request, string $regolaId): Response
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();
        $hotelId  = $request->get('hotel_id');
        if (! $hotelId || ! in_array($hotelId, $hotelIds, true)) {
            $hotelId = $hotelIds[0] ?? null;
        }

        $regola = Regola::findOrFail($regolaId);
        $hotel  = $hotelId ? Hotel::findOrFail($hotelId) : null;

        if ($hotel && ! in_array($hotel->id, $hotelIds, true)) {
            abort(403);
        }

        $lingue = $hotel?->lingue_abilitate ?? ['it'];

        $contenuti = collect($lingue)->mapWithKeys(function (string $lingua) use ($regola, $hotelId) {
            $val = $hotelId
                ? ValorizzazioneRegola::where('regola_id', $regola->id)
                    ->where('hotel_id', $hotelId)
                    ->where('lingua', $lingua)
                    ->first()
                : null;
            return [$lingua => $val?->testo ?? ''];
        });

        $hotels = Hotel::whereIn('id', $hotelIds)->get(['id', 'nome', 'lingue_abilitate']);

        return Inertia::render('Regolamento/Edit', [
            'regola'       => [
                'id'        => $regola->id,
                'codice'    => $regola->codice,
                'categoria' => $regola->categoria->value,
                'ordine'    => $regola->ordine,
            ],
            'contenuti'    => $contenuti,
            'lingue_hotel' => $lingue,
            'hotels'       => $hotels,
            'hotel_id'     => $hotelId,
            'profilo'      => $user->profilo->value,
        ]);
    }

    // ── Salva valorizzazione ──────────────────────────────────────────────────

    public function update(Request $request, string $regolaId): RedirectResponse
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $validated = $request->validate([
            'hotel_id'  => ['required', 'uuid', \Illuminate\Validation\Rule::in($hotelIds)],
            'lingue'    => ['required', 'array'],
            'lingue.*'  => ['nullable', 'string', 'max:50000'],
        ]);

        $regola = Regola::findOrFail($regolaId);
        $hotel  = Hotel::findOrFail($validated['hotel_id']);
        $lingueAbilitate = $hotel->lingue_abilitate ?? ['it'];

        foreach ($validated['lingue'] as $lingua => $testo) {
            // Ignora lingue non abilitate per questo hotel
            if (! in_array($lingua, $lingueAbilitate, true)) {
                continue;
            }

            ValorizzazioneRegola::updateOrCreate(
                [
                    'regola_id' => $regola->id,
                    'hotel_id'  => $hotel->id,
                    'lingua'    => $lingua,
                ],
                ['testo' => $testo ?: null]
            );
        }

        return redirect()
            ->route('regolamento.show', ['regola' => $regola->id, 'hotel_id' => $hotel->id])
            ->with('success', 'Regola aggiornata.');
    }
}
