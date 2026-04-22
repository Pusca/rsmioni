<?php

namespace App\Enums;

enum ContestoDocumento: string
{
    case Prenotazione = 'prenotazione';
    case Camera       = 'camera';
    case Regola       = 'regola';
}
