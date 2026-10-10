<?php

namespace App\Enums\Marketing;

/**
 * Stadi del funnel commerciale. L'ordine è quello di avanzamento:
 * nuovo → contattato → qualificato → appuntamento → cliente (oppure perso).
 */
enum StatoLead: string
{
    case Nuovo        = 'nuovo';
    case Contattato   = 'contattato';
    case Qualificato  = 'qualificato';
    case Appuntamento = 'appuntamento';
    case Cliente      = 'cliente';
    case Perso        = 'perso';

    public function label(): string
    {
        return match($this) {
            self::Nuovo        => 'Nuovo',
            self::Contattato   => 'Contattato',
            self::Qualificato  => 'Qualificato',
            self::Appuntamento => 'Appuntamento',
            self::Cliente      => 'Cliente',
            self::Perso        => 'Perso',
        };
    }

    /** Stati che contano come lead "vivi" (non persi). */
    public static function attivi(): array
    {
        return [self::Nuovo, self::Contattato, self::Qualificato, self::Appuntamento, self::Cliente];
    }
}
