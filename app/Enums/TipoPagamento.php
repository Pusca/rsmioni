<?php

namespace App\Enums;

enum TipoPagamento: string
{
    case GiaPagato = 'gia_pagato';
    case DaPagare  = 'da_pagare';
}
