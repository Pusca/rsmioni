<?php

namespace App\Services;

use App\Models\Documento;
use App\Models\LinkTemporaneo;
use Illuminate\Support\Str;

/**
 * Gestisce la generazione e il ciclo di vita dei link temporanei per i documenti.
 *
 * Un link temporaneo permette di condividere un documento via email
 * senza allegarlo: il destinatario riceve un URL con token che
 * scade dopo TTL_ORE ore.
 *
 * Al primo accesso il link viene marcato (`usato` + `primo_accesso_at`) e
 * resta valido solo per una breve finestra di grazia; `usato` impostato a
 * mano senza `primo_accesso_at` vale come revoca esplicita.
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
            'hotel_id'           => $documento->hotelId(),
            'scadenza_at'        => now()->addHours(self::TTL_ORE),
            'usato'              => false,
        ]);
    }
}
