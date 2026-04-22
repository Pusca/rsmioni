<?php

namespace App\Models;

use App\Enums\CategoriaRegola;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Regola extends Model
{
    use HasUuids;

    protected $table = 'regole';

    public $timestamps = false;

    protected $fillable = [
        'codice',
        'categoria',
        'ordine',
    ];

    protected function casts(): array
    {
        return [
            'categoria' => CategoriaRegola::class,
            'ordine'    => 'integer',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function valorizzazioni(): HasMany
    {
        return $this->hasMany(ValorizzazioneRegola::class);
    }

    /** Valorizzazione per hotel e lingua specifici */
    public function valorizzazionePerHotel(string $hotelId, string $lingua = 'it'): ?ValorizzazioneRegola
    {
        return $this->valorizzazioni()
            ->where('hotel_id', $hotelId)
            ->where('lingua', $lingua)
            ->first();
    }
}
