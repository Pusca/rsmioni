<?php

namespace App\Models;

use App\Enums\EsitoCollaudo;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Collaudo extends Model
{
    use HasUuids;

    protected $fillable = [
        'chiosco_id',
        'hotel_id',
        'eseguito_da',
        'esito',
        'sorgente',
        'note',
        'esiti_test',
        'versione_browser',
        'ip_rilevato',
    ];

    protected function casts(): array
    {
        return [
            'esito'       => EsitoCollaudo::class,
            'esiti_test'  => 'array',
        ];
    }

    public function chiosco(): BelongsTo
    {
        return $this->belongsTo(Chiosco::class);
    }

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }

    public function eseguitoDa(): BelongsTo
    {
        return $this->belongsTo(User::class, 'eseguito_da');
    }
}
