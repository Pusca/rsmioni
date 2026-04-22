<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class TurnoOrario extends Model
{
    protected $table = 'turni_orario';

    public $timestamps = false;

    protected $fillable = [
        'hotel_id',
        'ora_inizio',
        'ora_fine',
    ];

    protected function casts(): array
    {
        return [
            'ora_inizio' => 'datetime:H:i',
            'ora_fine'   => 'datetime:H:i',
        ];
    }

    public function hotel(): BelongsTo
    {
        return $this->belongsTo(Hotel::class);
    }
}
