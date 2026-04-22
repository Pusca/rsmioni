<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PrezzoCamera extends Model
{
    protected $table = 'prezzi_camera';

    public $timestamps = false;

    protected $fillable = [
        'camera_id',
        'tipo_occupazione',
        'prezzo',
        'valuta',
    ];

    protected function casts(): array
    {
        return [
            'prezzo' => 'decimal:2',
        ];
    }

    public function camera(): BelongsTo
    {
        return $this->belongsTo(Camera::class);
    }
}
