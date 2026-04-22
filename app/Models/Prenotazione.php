<?php

namespace App\Models;

use App\Enums\Profilo;
use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Prenotazione extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'prenotazioni';

    protected $fillable = [
        'hotel_id',
        'codice',
        'check_in',
        'check_out',
        'pax',
        'nome',
        'cognome',
        'gruppo',
        'tipo_pagamento',
        'documento_identita',
        'checkin_confermato',
        'checkin_confermato_at',
        'prezzo',
        'overbooking',
        'inserito_da',
        'inserito_da_profilo',
    ];

    protected function casts(): array
    {
        return [
            'check_in'              => 'date',
            'check_out'             => 'date',
            'pax'                   => 'array',
            'tipo_pagamento'        => TipoPagamento::class,
            'documento_identita'    => StatoDocumentoIdentita::class,
            'inserito_da_profilo'   => Profilo::class,
            'checkin_confermato'    => 'boolean',
            'checkin_confermato_at' => 'datetime',
            'overbooking'           => 'boolean',
            'prezzo'                => 'decimal:2',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }

    public function inseritoDa(): BelongsTo
    {
        return $this->belongsTo(User::class, 'inserito_da');
    }

    public function camere(): BelongsToMany
    {
        return $this->belongsToMany(Camera::class, 'camera_prenotazione');
    }

    public function documenti(): HasMany
    {
        return $this->hasMany(Documento::class, 'contesto_id')
            ->where('contesto_tipo', 'prenotazione');
    }

    public function pagamenti(): HasMany
    {
        return $this->hasMany(Pagamento::class);
    }

    // ── Helpers ────────────────────────────────────────────────────────

    /** Verifica se la data check_out è visibile per un dato hotel */
    public function checkOutVisibile(Hotel $hotel): bool
    {
        if (! $this->check_out) return false;
        $limite = now()->addDays($hotel->giorni_visibilita_calendario);
        return $this->check_out->lte($limite);
    }

    public function haPagamentoPos(): bool
    {
        return $this->pagamenti()->exists();
    }

    public function insertitoDaAlbergatore(): bool
    {
        return $this->inserito_da_profilo === Profilo::GestoreHotel;
    }
}
