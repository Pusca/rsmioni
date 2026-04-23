<?php

namespace App\Enums;

enum StatoInstallazione: string
{
    case DaInstallare = 'da_installare';
    case InCorso      = 'in_corso';
    case Installato   = 'installato';

    public function label(): string
    {
        return match ($this) {
            self::DaInstallare => 'Da installare',
            self::InCorso      => 'In corso',
            self::Installato   => 'Installato',
        };
    }
}
