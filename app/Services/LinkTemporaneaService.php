<?php

namespace App\Services;

use App\Models\Camera;
use App\Models\Documento;
use App\Models\LinkTemporaneo;
use App\Models\Prenotazione;
use Illuminate\Support\Str;

/**
 * Gestisce la generazione e il ciclo di vita dei link temporanei per i documenti.
 *
 * Un link temporaneo permette di condividere un documento via email
 * senza allegarlo: il destinatario riceve un URL con token che
 * scade dopo TTL_ORE ore.
 *
 * Il campo `usato` è disponibile per revoca esplicita futura
 * (non viene impostato a true all'accesso: il link è valido
 * per tutta la sua durata temporale).
 */
class LinkTemporaneaService
{
    public const TTL_ORE = 48;

    /**
     * Crea un nuovo link temporaneo per il documento.
     * Genera un token crittograficamente sicuro di 48 caratteri.
     */
    public function crea(
        Documento $documento,
        string    $email,
        ?string   $testo,
    ): LinkTemporaneo {
        return LinkTemporaneo::create([
            'documento_id'       => $documento->id,
            'token'              => Str::random(48),
            'destinatario_email' => $email,
            'testo_receptionist' => $testo,
            'hotel_id'           => $this->resolveHotelId($documento),
            'scadenza_at'        => now()->addHours(self::TTL_ORE),
            'usato'              => false,
        ]);
    }

    /**
     * Risolve l'hotel_id partendo dal contesto del documento.
     * Prenotazione → prenotazione.hotel_id
     * Camera       → camera.hotel_id
     * Regola       → null (ambito platform, nessun hotel specifico)
     */
    public function resolveHotelId(Documento $documento): ?string
    {
        return match ($documento->contesto_tipo->value) {
            'prenotazione' => Prenotazione::find($documento->contesto_id)?->hotel_id,
            'camera'       => Camera::find($documento->contesto_id)?->hotel_id,
            default        => null,
        };
    }
}
