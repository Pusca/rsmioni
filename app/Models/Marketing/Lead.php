<?php

namespace App\Models\Marketing;

use App\Enums\Marketing\StatoLead;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Lead extends Model
{
    use HasUuids;

    protected $table = 'marketing_lead';

    protected $fillable = [
        'codice', 'campagna_id', 'struttura', 'referente', 'citta',
        'telefono', 'email', 'fonte', 'stato', 'gestito_da', 'ricevuto_at', 'note',
    ];

    protected function casts(): array
    {
        return [
            'stato'       => StatoLead::class,
            'ricevuto_at' => 'datetime:Y-m-d H:i',
        ];
    }

    public function campagna(): BelongsTo
    {
        return $this->belongsTo(Campagna::class, 'campagna_id');
    }

    public function appuntamenti(): HasMany
    {
        return $this->hasMany(Appuntamento::class, 'lead_id')->orderBy('inizio');
    }

    public function eventi(): HasMany
    {
        return $this->hasMany(EventoMarketing::class, 'lead_id')->orderByDesc('avvenuto_at');
    }
}
