<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Hotel extends Model
{
    use HasFactory, HasUuids;

    protected $fillable = [
        'nome',
        'indirizzo',
        'data_inizio_contratto',
        'data_fine_contratto',
        'giorni_visibilita_calendario',
        'overbooking_permesso',
        'delega_rs_mioni',
        'giorni_cancellazione_automatica',
        'chioschi_concorrenti_max',
        'checkout_libero',
        'checkout_ora',
        'lingua_default',
        'lingue_abilitate',
        'logo_path',
        'sfondo_kiosk_path',
        'suoneria_attiva',
        'volume_suoneria',
        'numero_massimo_pax',
        'campi_pax_obbligatori',
    ];

    protected function casts(): array
    {
        return [
            'data_inizio_contratto'           => 'date',
            'data_fine_contratto'             => 'date',
            'overbooking_permesso'            => 'boolean',
            'delega_rs_mioni'                 => 'boolean',
            'checkout_libero'                 => 'boolean',
            'suoneria_attiva'                 => 'boolean',
            'lingue_abilitate'                => 'array',
            'campi_pax_obbligatori'           => 'array',
            'giorni_visibilita_calendario'    => 'integer',
            'giorni_cancellazione_automatica' => 'integer',
            'chioschi_concorrenti_max'        => 'integer',
            'volume_suoneria'                 => 'integer',
            'numero_massimo_pax'              => 'integer',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function chioschi(): HasMany
    {
        return $this->hasMany(Chiosco::class);
    }

    public function camere(): HasMany
    {
        return $this->hasMany(Camera::class);
    }

    public function prenotazioni(): HasMany
    {
        return $this->hasMany(Prenotazione::class);
    }

    public function turni(): HasMany
    {
        return $this->hasMany(TurnoOrario::class);
    }

    public function valorizzazioniRegola(): HasMany
    {
        return $this->hasMany(ValorizzazioneRegola::class);
    }

    public function utenti(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'hotel_user');
    }
}
