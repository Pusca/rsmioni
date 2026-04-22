<?php

namespace App\Services;

use App\Enums\ContestoDocumento;
use App\Models\Documento;
use App\Models\User;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DocumentoService
{
    /**
     * Salva il file su disco e crea il record Documento.
     */
    public function upload(
        UploadedFile $file,
        ContestoDocumento $contestoTipo,
        string $contestoId,
        string $inseritoDa,
        string $inseritoDaProfilo,
        ?string $titolo = null,
        ?string $lingua = null,
        ?string $tipoDocumento = null,
    ): Documento {
        $estensione = strtolower($file->getClientOriginalExtension());
        $nomeFile   = Str::uuid() . '.' . $estensione;
        $directory  = "documenti/{$contestoTipo->value}/{$contestoId}";

        Storage::disk('local')->putFileAs($directory, $file, $nomeFile);

        return Documento::create([
            'contesto_tipo'       => $contestoTipo,
            'contesto_id'         => $contestoId,
            'titolo'              => $titolo ?: pathinfo($file->getClientOriginalName(), PATHINFO_FILENAME),
            'lingua'              => $lingua,
            'tipo_documento'      => $tipoDocumento,
            'estensione'          => $estensione,
            'storage_path'        => "{$directory}/{$nomeFile}",
            'inserito_da'         => $inseritoDa,
            'inserito_da_profilo' => $inseritoDaProfilo,
        ]);
    }

    /**
     * Verifica se l'utente può richiedere la stampa remota del documento.
     *
     * Regole:
     *  - Gestore Hotel: sempre sì
     *  - Receptionist: sì
     *  - Receptionist Lite / Chiosco: no
     *
     * Nota: la disponibilità di un chiosco con stampante è un requisito
     * operativo verificato lato UI e in StampaController::store().
     */
    public function puoStampare(User $utente, Documento $documento): bool
    {
        return in_array($utente->profilo->value, ['gestore_hotel', 'receptionist'], true);
    }

    /**
     * Verifica se l'utente può inviare il documento via link temporaneo.
     *
     * Regole:
     *  - Gestore Hotel: sempre sì
     *  - Receptionist: sì (su qualunque documento a cui ha accesso)
     *  - Receptionist Lite / Chiosco: no
     */
    public function puoInviare(User $utente, Documento $documento): bool
    {
        return in_array($utente->profilo->value, ['gestore_hotel', 'receptionist'], true);
    }

    /**
     * Verifica se l'utente può cancellare il documento.
     *
     * Regole:
     *  - Gestore Hotel: sempre sì
     *  - Receptionist: solo su prenotazioni, e solo se non inserito dal gestore
     */
    public function puoCancellare(User $utente, Documento $documento): bool
    {
        if ($utente->profilo->value === 'gestore_hotel') {
            return true;
        }

        if ($utente->profilo->value === 'receptionist') {
            return $documento->contesto_tipo === ContestoDocumento::Prenotazione
                && ! $documento->inseritoDaAlbergatore();
        }

        return false;
    }

    /**
     * Elimina il file dal disco e il record dal DB.
     */
    public function elimina(Documento $documento): void
    {
        Storage::disk('local')->delete($documento->storage_path);
        $documento->delete();
    }

    /**
     * Mappa estensione → MIME type.
     */
    public function mimeType(string $estensione): string
    {
        return match (strtolower($estensione)) {
            'pdf'          => 'application/pdf',
            'png'          => 'image/png',
            'jpg', 'jpeg'  => 'image/jpeg',
            default        => 'application/octet-stream',
        };
    }

    /**
     * Serializza un Documento per Inertia, con i flag di permesso calcolati.
     */
    public function serializza(Documento $documento, User $utente): array
    {
        return [
            'id'                  => $documento->id,
            'titolo'              => $documento->titolo,
            'lingua'              => $documento->lingua,
            'tipo_documento'      => $documento->tipo_documento,
            'estensione'          => $documento->estensione,
            'inserito_da_profilo' => $documento->inserito_da_profilo->value,
            'created_at'          => $documento->created_at->toISOString(),
            'puo_cancellare'      => $this->puoCancellare($utente, $documento),
            'puo_inviare'         => $this->puoInviare($utente, $documento),
            'puo_stampare'        => $this->puoStampare($utente, $documento),
        ];
    }
}
