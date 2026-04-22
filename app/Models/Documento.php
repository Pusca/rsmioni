<?php

namespace App\Models;

use App\Enums\ContestoDocumento;
use App\Enums\Profilo;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Documento extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'documenti';

    protected $fillable = [
        'contesto_tipo',
        'contesto_id',
        'titolo',
        'lingua',
        'tipo_documento',
        'estensione',
        'storage_path',
        'inserito_da',
        'inserito_da_profilo',
    ];

    protected function casts(): array
    {
        return [
            'contesto_tipo'      => ContestoDocumento::class,
            'inserito_da_profilo'=> Profilo::class,
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function inseritoDa(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inserito_da');
    }

    public function linksTemporanei(): HasMany
    {
        return $this->hasMany(LinkTemporaneo::class);
    }

    // ── Helpers ────────────────────────────────────────────────────────

    public function inseritoDaAlbergatore(): bool
    {
        return $this->inserito_da_profilo === Profilo::GestoreHotel;
    }
}
