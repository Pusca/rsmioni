<?php

namespace App\Events;

use App\Enums\StatoChiosco;
use App\Models\Chiosco;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Broadcast quando lo stato di un chiosco cambia.
 * Canale: portineria.{hotel_id} (private)
 *
 * Usato da:
 *   - PortineriaService::impostaStato()
 *   - Ascoltato da Echo in usePortineriaRealtime.ts
 */
class ChioscoStatoCambiato implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly Chiosco      $chiosco,
        public readonly StatoChiosco $stato,
        public readonly ?string      $messaggio = null,
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("portineria.{$this->chiosco->hotel_id}"),
            // Il browser chiosco riceve anche lui i cambi di stato per
            // mostrare la schermata corretta (in_chiamata, messaggio_attesa, ecc.)
            new PrivateChannel("chiosco.{$this->chiosco->id}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'chiosco.stato_cambiato';
    }

    public function broadcastWith(): array
    {
        return [
            'chiosco_id'      => $this->chiosco->id,
            'chiosco_nome'    => $this->chiosco->nome,
            'stato'           => $this->stato->value,
            'messaggio'       => $this->messaggio,
        ];
    }
}
