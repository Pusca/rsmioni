<?php

namespace App\Models;

use App\Enums\TipoChiosco;
use App\Enums\TipoPOS;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Chiosco extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'chioschi';

    protected $fillable = [
        'hotel_id',
        'nome',
        'tipo',
        'interattivo',
        'has_pos',
        'tipo_pos',
        'has_stampante',
        'path_input_pos',
        'path_output_pos',
        'path_config_pos',
        'path_log_pos',
        'attivo',
        'ip_address',
    ];

    protected function casts(): array
    {
        return [
            'tipo'          => TipoChiosco::class,
            'tipo_pos'      => TipoPOS::class,
            'interattivo'   => 'boolean',
            'has_pos'       => 'boolean',
            'has_stampante' => 'boolean',
            'attivo'        => 'boolean',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }

    public function pagamenti(): HasMany
    {
        return $this->hasMany(Pagamento::class);
    }

    // ── Helpers ────────────────────────────────────────────────────────

    /** Redis key per lo stato runtime di questo chiosco */
    public function redisStateKey(): string
    {
        return "kiosk_state:{$this->id}";
    }
}
