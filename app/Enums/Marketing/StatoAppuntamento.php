<?php

namespace App\Enums\Marketing;

enum StatoAppuntamento: string
{
    case Programmato = 'programmato';
    case Confermato  = 'confermato';
    case Completato  = 'completato';
    case Annullato   = 'annullato';
    case NoShow      = 'no_show';

    public function label(): string
    {
        return match($this) {
            self::Programmato => 'Programmato',
            self::Confermato  => 'Confermato',
            self::Completato  => 'Completato',
            self::Annullato   => 'Annullato',
            self::NoShow      => 'Non presentato',
        };
    }

    /** Appuntamenti che valgono nel funnel (esclusi annullati e no-show). */
    public static function validi(): array
    {
        return [self::Programmato, self::Confermato, self::Completato];
    }
}
