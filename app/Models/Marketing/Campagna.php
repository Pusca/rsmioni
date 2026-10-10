<?php

namespace App\Models\Marketing;

use App\Enums\Marketing\Piattaforma;
use App\Enums\Marketing\StatoCampagna;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Campagna extends Model
{
    use HasUuids;

    protected $table = 'marketing_campagne';

    protected $fillable = [
        'codice', 'nome', 'piattaforma', 'obiettivo', 'stato',
        'budget', 'speso', 'impression', 'click', 'lead_dichiarati',
        'contenuti_ai', 'data_inizio', 'data_fine', 'note',
    ];

    protected function casts(): array
    {
        return [
            'piattaforma'     => Piattaforma::class,
            'stato'           => StatoCampagna::class,
            'budget'          => 'decimal:2',
            'speso'           => 'decimal:2',
            'impression'      => 'integer',
            'click'           => 'integer',
            'lead_dichiarati' => 'integer',
            'contenuti_ai'    => 'boolean',
            'data_inizio'     => 'date:Y-m-d',
            'data_fine'       => 'date:Y-m-d',
        ];
    }

    public function lead(): HasMany
    {
        return $this->hasMany(Lead::class, 'campagna_id');
    }
}
