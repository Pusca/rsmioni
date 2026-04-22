<?php

namespace App\Enums;

enum Profilo: string
{
    case Receptionist         = 'receptionist';
    case ReceptionistLite     = 'receptionist_lite';
    case Chiosco              = 'chiosco';
    case GestoreHotel         = 'gestore_hotel';
    case GestoreReceptionist  = 'gestore_receptionist'; // v1.1+
    case Admin                = 'admin';                // v1.1+

    public function label(): string
    {
        return match($this) {
            self::Receptionist        => 'Receptionist',
            self::ReceptionistLite    => 'Receptionist Lite',
            self::Chiosco             => 'Chiosco',
            self::GestoreHotel        => 'Gestore Hotel',
            self::GestoreReceptionist => 'Gestore Receptionist',
            self::Admin               => 'Amministratore',
        };
    }

    /** Profili disponibili in v1.0 */
    public static function v1(): array
    {
        return [
            self::Receptionist,
            self::ReceptionistLite,
            self::Chiosco,
            self::GestoreHotel,
        ];
    }

    public function puoAccederePortineria(): bool
    {
        return in_array($this, [self::Receptionist, self::ReceptionistLite]);
    }

    public function haInterattivita(): bool
    {
        return $this === self::Receptionist;
    }

    public function puoGestireCamere(): bool
    {
        return in_array($this, [self::GestoreHotel, self::Admin]);
    }

    public function puoGestirePrenotazioni(): bool
    {
        return in_array($this, [self::Receptionist, self::GestoreHotel, self::Admin]);
    }
}
