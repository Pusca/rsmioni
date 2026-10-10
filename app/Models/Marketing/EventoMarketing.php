<?php

namespace App\Models\Marketing;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Riga di timeline: cosa è successo su un lead/appuntamento e chi l'ha fatto
 * (chip = automazione, umano = team RS Mioni, cliente = la struttura).
 */
class EventoMarketing extends Model
{
    use HasUuids;

    protected $table = 'marketing_eventi';

    protected $fillable = [
        'codice', 'lead_id', 'appuntamento_id', 'tipo', 'attore', 'descrizione', 'avvenuto_at',
    ];

    protected function casts(): array
    {
        return [
            'avvenuto_at' => 'datetime:Y-m-d H:i',
        ];
    }

    public function lead(): BelongsTo
    {
        return $this->belongsTo(Lead::class, 'lead_id');
    }

    public function appuntamento(): BelongsTo
    {
        return $this->belongsTo(Appuntamento::class, 'appuntamento_id');
    }
}
