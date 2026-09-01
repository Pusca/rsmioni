<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LinkTemporaneo extends Model
{
    use HasUuids;

    /**
     * Minuti di validità dopo il primo accesso: il link è pensato per una
     * sola apertura, ma il browser può fare più richieste per lo stesso
     * documento (viewer PDF, range request, ricarica). Passata la finestra
     * il link è chiuso anche se la scadenza assoluta non è ancora arrivata.
     */
    public const GRAZIA_DOPO_PRIMO_ACCESSO_MINUTI = 15;

    protected $table = 'links_temporanei';

    protected $fillable = [
        'documento_id',
        'token',
        'destinatario_email',
        'testo_receptionist',
        'hotel_id',      // nullable: null per documenti regolamento (ambito platform)
        'scadenza_at',
        'usato',
        'primo_accesso_at',
    ];

    protected function casts(): array
    {
        return [
            'scadenza_at'      => 'datetime',
            'usato'            => 'boolean',
            'primo_accesso_at' => 'datetime',
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

    /** Il link è stato aperto e la finestra di grazia è finita. */
    public function isConsumato(): bool
    {
        return $this->primo_accesso_at !== null
            && $this->primo_accesso_at->addMinutes(self::GRAZIA_DOPO_PRIMO_ACCESSO_MINUTI)->isPast();
    }

    /**
     * Valido = non revocato, non scaduto, non consumato.
     * `usato` senza `primo_accesso_at` è una revoca esplicita (impostata a mano).
     */
    public function isValido(): bool
    {
        if ($this->usato && $this->primo_accesso_at === null) {
            return false; // revoca esplicita
        }

        return ! $this->isScaduto() && ! $this->isConsumato();
    }

    /** Registra il primo accesso (idempotente). */
    public function registraAccesso(): void
    {
        if ($this->primo_accesso_at === null) {
            $this->forceFill(['primo_accesso_at' => now(), 'usato' => true])->save();
        }
    }
}
