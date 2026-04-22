<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class ValorizzazioneRegola extends Model
{
    use HasUuids;

    protected $table = 'valorizzazioni_regola';

    protected $fillable = [
        'regola_id',
        'hotel_id',
        'lingua',
        'testo',
    ];

    // ── Relazioni ──────────────────────────────────────────────────────

    public function regola(): BelongsTo
    {
        return $this->belongsTo(Regola::class);
    }

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }

    /**
     * I documenti di una regola sono condivisi fra tutte le lingue
     * dello stesso regola+hotel. Li recuperiamo dalla contesto_id = regola_id
     * e contesto_tipo = 'regola'.
     */
    public function documenti(): HasMany
    {
        return $this->hasMany(Documento::class, 'contesto_id', 'regola_id')
            ->where('contesto_tipo', 'regola');
    }
}
