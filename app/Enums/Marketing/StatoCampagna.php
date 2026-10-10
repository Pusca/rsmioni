<?php

namespace App\Enums\Marketing;

enum StatoCampagna: string
{
    case Bozza    = 'bozza';
    case Attiva   = 'attiva';
    case InPausa  = 'in_pausa';
    case Conclusa = 'conclusa';

    public function label(): string
    {
        return match($this) {
            self::Bozza    => 'Bozza',
            self::Attiva   => 'Attiva',
            self::InPausa  => 'In pausa',
            self::Conclusa => 'Conclusa',
        };
    }
}
