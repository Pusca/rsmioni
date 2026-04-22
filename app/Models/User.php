<?php

namespace App\Models;

use App\Enums\Profilo;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, HasUuids, Notifiable;

    protected $table = 'users';

    protected $fillable = [
        'username',
        'email',
        'password',
        'profilo',
        'ip_whitelist',
        'attivo',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'password'     => 'hashed',
            'profilo'      => Profilo::class,
            'ip_whitelist' => 'array',
            'attivo'       => 'boolean',
        ];
    }

    // ── Relazioni ──────────────────────────────────────────────────────

    public function hotels(): BelongsToMany
    {
        return $this->belongsToMany(Hotel::class, 'hotel_user');
    }

    // ── Helpers ────────────────────────────────────────────────────────

    public function isReceptionist(): bool
    {
        return $this->profilo === Profilo::Receptionist;
    }

    public function isReceptionistLite(): bool
    {
        return $this->profilo === Profilo::ReceptionistLite;
    }

    public function isChiosco(): bool
    {
        return $this->profilo === Profilo::Chiosco;
    }

    public function isGestoreHotel(): bool
    {
        return $this->profilo === Profilo::GestoreHotel;
    }

    public function puoAccederePortineria(): bool
    {
        return $this->profilo->puoAccederePortineria();
    }

    public function haInterattivita(): bool
    {
        return $this->profilo->haInterattivita();
    }

    /** ID degli hotel associati a questo utente */
    public function hotelIds(): array
    {
        return $this->hotels()->pluck('hotels.id')->toArray();
    }
}
