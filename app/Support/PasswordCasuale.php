<?php

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Password generate dall'applicazione (utenti reali da console, account demo
 * dalla pagina «Account demo»): rispettano sempre le regole del cambio
 * password (maiuscole, minuscole, cifre) e non usano simboli, così si
 * dettano a voce e si digitano sul totem senza errori.
 */
final class PasswordCasuale
{
    public static function genera(int $lunghezza = 12): string
    {
        do {
            $p = Str::password($lunghezza, symbols: false);
        } while (! preg_match('/[a-z]/', $p) || ! preg_match('/[A-Z]/', $p) || ! preg_match('/\d/', $p));

        return $p;
    }
}
