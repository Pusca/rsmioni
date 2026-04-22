<?php

namespace App\Enums;

/**
 * Stato runtime di un chiosco.
 * NON è persistito in DB — vive in Redis/Cache con TTL.
 * Specchio del type StatoChiosco in resources/js/types/index.d.ts
 */
enum StatoChiosco: string
{
    case Offline         = 'offline';
    case Idle            = 'idle';
    case InChiamata      = 'in_chiamata';
    case InChiaro        = 'in_chiaro';
    case InNascosto      = 'in_nascosto';
    case InParlato       = 'in_parlato';       // M2 — WebRTC
    case MessaggioAttesa = 'messaggio_attesa';

    public function label(): string
    {
        return match($this) {
            self::Offline         => 'Offline',
            self::Idle            => 'Disponibile',
            self::InChiamata      => 'Chiamata in arrivo',
            self::InChiaro        => 'In chiaro',
            self::InNascosto      => 'In nascosto',
            self::InParlato       => 'In parlato',
            self::MessaggioAttesa => 'Messaggio attesa',
        };
    }

    /** Transizioni lecite per ogni stato sorgente */
    public function transizionilecite(): array
    {
        return match($this) {
            self::Offline         => [self::Idle],
            self::Idle            => [self::InChiamata, self::InChiaro, self::InNascosto, self::MessaggioAttesa, self::Offline],
            self::InChiamata      => [self::InChiaro, self::InNascosto, self::Idle],
            self::InChiaro        => [self::InNascosto, self::MessaggioAttesa, self::InParlato, self::Idle],
            self::InNascosto      => [self::InChiaro, self::Idle],
            self::InParlato       => [self::InChiaro, self::InNascosto, self::Idle],
            self::MessaggioAttesa => [self::InChiaro, self::Idle],
        };
    }

    public function puoTransire(self $destinazione): bool
    {
        return in_array($destinazione, $this->transizionilecite(), true);
    }

    /** Stati che costituiscono una "connessione attiva" */
    public function isConnesso(): bool
    {
        return in_array($this, [self::InChiaro, self::InNascosto, self::InParlato]);
    }
}
