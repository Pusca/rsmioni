<?php

namespace App\Events;

use App\Models\Chiosco;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Briefing del self check-in in corso, scritto dal receptionist AI per il
 * collega umano (dati dell'ospite, fase, documenti, motivo del passaggio,
 * punti salienti e trascrizione). Arriva a ogni avanzamento di fase e, con i
 * punti salienti, quando l'AI chiama un receptionist o l'ospite tocca il
 * pulsante verde: chi subentra sa già con chi parla e a che punto è.
 *
 * Canale: portineria.{hotel_id}. `briefing=null` quando decade (chiosco idle).
 */
class AiBriefingAggiornato implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly Chiosco $chiosco,
        public readonly ?array  $briefing,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("portineria.{$this->chiosco->hotel_id}")];
    }

    public function broadcastAs(): string
    {
        return 'ai.briefing';
    }

    public function broadcastWith(): array
    {
        return [
            'chiosco_id' => $this->chiosco->id,
            'briefing'   => $this->briefing,
        ];
    }
}
