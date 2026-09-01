<?php

namespace App\Http\Controllers\Documenti;

use App\Http\Controllers\Controller;
use App\Models\LinkTemporaneo;
use App\Services\DocumentoService;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Accesso pubblico a un documento tramite link temporaneo.
 *
 * Questo endpoint non richiede autenticazione.
 * La sicurezza è garantita da:
 *   - token a 48 caratteri random (>= 2^287 combinazioni)
 *   - scadenza temporale (TTL_ORE ore dalla creazione)
 *   - primo accesso registrato: dopo una breve finestra di grazia il link
 *     è chiuso (vedi LinkTemporaneo::GRAZIA_DOPO_PRIMO_ACCESSO_MINUTI)
 *   - flag `usato` per revoca esplicita
 *
 * Il documento viene servito inline (visualizzazione browser).
 */
class LinkTemporaneoController extends Controller
{
    public function __construct(private readonly DocumentoService $service) {}

    public function show(string $token): StreamedResponse|Response
    {
        $link = LinkTemporaneo::with('documento')
            ->where('token', $token)
            ->first();

        // Token non trovato
        if (! $link) {
            return response(
                view('errors.link-non-valido', ['motivo' => 'Link non trovato.']),
                404
            );
        }

        // Link scaduto, consumato o revocato
        if (! $link->isValido()) {
            $motivo = $link->isScaduto()
                ? 'Questo link è scaduto.'
                : 'Questo link è già stato utilizzato.';

            return response(
                view('errors.link-non-valido', ['motivo' => $motivo]),
                410
            );
        }

        $documento = $link->documento;

        // Verifica che il file esista fisicamente
        if (! Storage::disk('local')->exists($documento->storage_path)) {
            return response(
                view('errors.link-non-valido', ['motivo' => 'Il file non è disponibile.']),
                404
            );
        }

        // Da qui il link è "aperto": resta valido solo per la finestra di grazia.
        $link->registraAccesso();

        $nome = ($documento->titolo ?? 'documento') . '.' . $documento->estensione;

        return response()->streamDownload(
            function () use ($documento) {
                echo Storage::disk('local')->get($documento->storage_path);
            },
            $nome,
            [
                'Content-Type'        => $this->service->mimeType($documento->estensione),
                'Content-Disposition' => 'inline; filename="' . addslashes($nome) . '"',
            ]
        );
    }
}
