<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LinkTemporaneo extends Model
{
    use HasUuids;

    protected $table = 'links_temporanei';

    protected $fillable = [
        'documento_id',
        'token',
        'destinatario_email',
        'testo_receptionist',
        'hotel_id',      // nullable: null per documenti regolamento (ambito platform)
        'scadenza_at',
        'usato',
    ];

    protected function casts(): array
    {
        return [
            'scadenza_at' => 'datetime',
            'usato'       => 'boolean',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function documento(): BelongsTo
    {
        return $this->belongsTo(Documento::class);
    }

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }

    // ── Helpers ────────────────────────────────────────────────────────

    public function isScaduto(): bool
    {
        return $this->scadenza_at->isPast();
    }

    public function isValido(): bool
    {
        return ! $this->usato && ! $this->isScaduto();
    }
}
