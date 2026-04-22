<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Camera extends Model
{
    use HasFactory, HasUuids;

    protected $table = 'camere';

    protected $fillable = [
        'hotel_id',
        'nome',
        'tipo',
        'piano',
        'booking_consentito',
        'letti_matrimoniali',
        'letti_singoli',
        'letti_aggiunti',
        'divani_letto_singoli',
        'divani_letto_matrimoniali',
        'culle',
        'doccia',
        'vasca',
        'minibar',
        'minibar_pieno',
        'aria_condizionata',
        'quadro_elettrico',
        'codice_chiave',
        'mq',
    ];

    protected function casts(): array
    {
        return [
            'booking_consentito'        => 'boolean',
            'doccia'                    => 'boolean',
            'vasca'                     => 'boolean',
            'minibar'                   => 'boolean',
            'minibar_pieno'             => 'boolean',
            'aria_condizionata'         => 'boolean',
            'letti_matrimoniali'        => 'integer',
            'letti_singoli'             => 'integer',
            'letti_aggiunti'            => 'integer',
            'divani_letto_singoli'      => 'integer',
            'divani_letto_matrimoniali' => 'integer',
            'culle'                     => 'integer',
            'mq'                        => 'decimal:2',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }

    public function prezzi(): HasMany
    {
        return $this->hasMany(PrezzoCamera::class);
    }

    public function prenotazioni(): BelongsToMany
    {
        return $this->belongsToMany(Prenotazione::class, 'camera_prenotazione');
    }

    public function documenti(): HasMany
    {
        // Documenti con contesto_tipo = 'camera'
        return $this->hasMany(Documento::class, 'contesto_id')
            ->where('contesto_tipo', 'camera');
    }

    // ── Helpers ────────────────────────────────────────────────────────

    /** Descrizione testuale dei letti (per tooltip) */
    public function lettiDescrizione(): string
    {
        $parts = [];
        if ($this->letti_matrimoniali)        $parts[] = "M:{$this->letti_matrimoniali}";
        if ($this->letti_singoli)             $parts[] = "S:{$this->letti_singoli}";
        if ($this->letti_aggiunti)            $parts[] = "A:{$this->letti_aggiunti}";
        if ($this->divani_letto_singoli)      $parts[] = "DS:{$this->divani_letto_singoli}";
        if ($this->divani_letto_matrimoniali) $parts[] = "DM:{$this->divani_letto_matrimoniali}";
        if ($this->culle)                     $parts[] = "C:{$this->culle}";
        return implode(' ', $parts);
    }
}
