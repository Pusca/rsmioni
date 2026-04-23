<?php

namespace App\Enums;

enum EsitoCollaudo: string
{
    case Superato = 'superato';
    case Parziale = 'parziale';
    case Fallito  = 'fallito';

    public function label(): string
    {
        return match($this) {
            self::Superato => 'Superato',
            self::Parziale => 'Parziale',
            self::Fallito  => 'Fallito',
        };
    }
}
