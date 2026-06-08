<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\ContestoDocumento;
use App\Enums\StatoDocumentoIdentita;
use App\Http\Controllers\Controller;
use App\Models\Prenotazione;
use App\Services\DocumentoService;
use App\Services\PrenotazioneService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Acquisizione documento "dal vivo" durante il collegamento: il receptionist
 * cattura un fotogramma dal video del chiosco e lo salva sulla prenotazione.
 *
 * A differenza del vecchio flusso (AcquisizioneDocumentoController) NON coinvolge
 * la webcam del chiosco né una schermata separata: l'immagine arriva già pronta
 * dal frame del video LiveKit, quindi è immediata e non va in conflitto con la
 * camera già in uso dalla chiamata.
 */
class CatturaDocumentoController extends Controller
{
    public function __construct(
        private readonly DocumentoService   $documentoService,
        private readonly PrenotazioneService $prenotazioneService,
    ) {}

    /**
     * Prenotazioni candidate per la tendina (check-in recenti/imminenti negli
     * hotel del receptionist).
     * GET /portineria/cattura/prenotazioni
     */
    public function prenotazioni(Request $request): JsonResponse
    {
        $user     = $request->user();
        $hotelIds = $user->hotelIds();

        $items = Prenotazione::whereIn('hotel_id', $hotelIds)
            ->whereBetween('check_in', [now()->subDays(2)->toDateString(), now()->addDays(14)->toDateString()])
            ->orderBy('check_in')
            ->limit(100)
            ->get(['id', 'nome', 'cognome', 'gruppo', 'codice', 'check_in'])
            ->map(function (Prenotazione $p) {
                $ospite = trim(($p->nome ?? '') . ' ' . ($p->cognome ?? ''));
                if ($ospite === '') $ospite = $p->gruppo ?: 'Senza nome';
                $data = $p->check_in ? $p->check_in->format('d/m/Y') : '—';
                return [
                    'id'    => $p->id,
                    'label' => $ospite . ($p->codice ? " · {$p->codice}" : '') . " · {$data}",
                ];
            });

        return response()->json(['prenotazioni' => $items])
            ->header('Cache-Control', 'no-store');
    }

    /**
     * Salva un fotogramma catturato come documento sulla prenotazione.
     * POST /portineria/cattura/documento  (multipart: prenotazione_id, file, lato?, tipo_documento?)
     */
    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'prenotazione_id' => ['required', 'uuid'],
            'file'            => ['required', 'image', 'max:20480'], // 20 MB
            'lato'            => ['nullable', 'in:fronte,retro'],
            'tipo_documento'  => ['nullable', 'string', 'max:50'],
        ]);

        $user = $request->user();
        $pren = Prenotazione::findOrFail($validated['prenotazione_id']);

        if (! $this->prenotazioneService->accessoConsentito($user, $pren)) {
            return response()->json(['error' => 'Accesso non consentito alla prenotazione.'], 403);
        }

        $lato   = $validated['lato'] ?? null;
        $titolo = 'Documento acquisito' . ($lato ? ' (' . $lato . ')' : '');

        $documento = $this->documentoService->upload(
            file:              $request->file('file'),
            contestoTipo:      ContestoDocumento::Prenotazione,
            contestoId:        $pren->id,
            inseritoDa:        $user->id,
            inseritoDaProfilo: $user->profilo->value,
            titolo:            $titolo,
            lingua:            null,
            tipoDocumento:     $validated['tipo_documento'] ?? 'carta_identita',
        );

        // Il documento è stato acquisito → la prenotazione passa a "già fornito"
        if ($pren->documento_identita !== StatoDocumentoIdentita::GiaFornito) {
            $pren->update(['documento_identita' => StatoDocumentoIdentita::GiaFornito]);
        }

        return response()->json(['ok' => true, 'documento_id' => $documento->id]);
    }
}
