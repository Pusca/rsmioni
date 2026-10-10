<?php

namespace App\Models\Marketing;

use App\Enums\Marketing\StatoAppuntamento;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Appuntamento extends Model
{
    use HasUuids;

    protected $table = 'marketing_appuntamenti';

    protected $fillable = [
        'codice', 'lead_id', 'inizio', 'inizio_originale', 'durata_minuti',
        'tipo', 'stato', 'gestito_da', 'note',
    ];

    protected $appends = ['spostato'];

    protected function casts(): array
    {
        return [
            'stato'            => StatoAppuntamento::class,
            'inizio'           => 'datetime:Y-m-d H:i',
            'inizio_originale' => 'datetime:Y-m-d H:i',
            'durata_minuti'    => 'integer',
        ];
    }

    /** True se l'orario è stato cambiato rispetto a quello fissato in origine. */
    public function getSpostatoAttribute(): bool
    {
        return $this->inizio_originale !== null;
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class, 'lead_id');
    }

    public function eventi(): HasMany
    {
        return $this->hasMany(EventoMarketing::class, 'appuntamento_id')->orderByDesc('avvenuto_at');
    }
}
