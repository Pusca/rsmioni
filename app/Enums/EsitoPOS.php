<?php

namespace App\Enums;

enum EsitoPOS: string
{
    case Pending   = 'pending';
    case Ok        = 'ok';
    case Ko        = 'ko';
    case NoFile    = 'no_file';
    case Annullato = 'annullato';
}
