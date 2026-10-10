<?php

namespace App\Enums\Marketing;

enum Piattaforma: string
{
    case Facebook    = 'facebook';
    case Instagram   = 'instagram';
    case Google      = 'google';
    case YouTube     = 'youtube';
    case Display     = 'display';      // rete display / siti affini
    case Retargeting = 'retargeting';
    case Altro       = 'altro';

    public function label(): string
    {
        return match($this) {
            self::Facebook    => 'Facebook',
            self::Instagram   => 'Instagram',
            self::Google      => 'Google',
            self::YouTube     => 'YouTube',
            self::Display     => 'Rete display',
            self::Retargeting => 'Retargeting',
            self::Altro       => 'Altro',
        };
    }
}
