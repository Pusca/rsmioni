<?php

namespace App\Models;

use App\Enums\EsitoPOS;
use App\Enums\TipoPOS;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Pagamento extends Model
{
    use HasUuids;

    protected $table = 'pagamenti';

    protected $fillable = [
        'prenotazione_id',
        'chiosco_id',
        'importo_richiesto',
        'valuta',
        'esito',
        'importo_effettivo',
        'tipo_pos',
        'data_operazione',
        'eseguito_da',
    ];

    protected function casts(): array
    {
        return [
            'importo_richiesto' => 'decimal:2',
            'importo_effettivo' => 'decimal:2',
            'esito'             => EsitoPOS::class,
            'tipo_pos'          => TipoPOS::class,
            'data_operazione'   => 'datetime',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function prenotazione(): BelongsTo
    {
        return $this->belongsTo(Prenotazione::class);
    }

    public function chiosco(): BelongsTo
    {
        return $this->belongsTo(Chiosco::class);
    }

    public function eseguitoDa(): BelongsTo
    {
        return $this->belongsTo(User::class, 'eseguito_da');
    }
}
