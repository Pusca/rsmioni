<?php

namespace App\Events;

use App\Models\Chiosco;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Il receptionist AI chiede l'intervento di un umano (docs/09 §6, FLOW 06).
 *
 * Canale: portineria.{hotel_id} — tutti i receptionist dell'hotel vedono la
 * campanella sulla cella del chiosco e sentono la suoneria. `attivo=false`
 * quando la richiesta si chiude (subentro o fine sessione).
 */
class AiHandoffRichiesto implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly Chiosco $chiosco,
        public readonly bool    $attivo,
        public readonly ?string $motivo = null,
    ) {}

    public function broadcastOn(): array
    {
        return [new PrivateChannel("portineria.{$this->chiosco->hotel_id}")];
    }

    public function broadcastAs(): string
    {
        return 'ai.handoff';
    }

    public function broadcastWith(): array
    {
        return [
            'chiosco_id'   => $this->chiosco->id,
            'chiosco_nome' => $this->chiosco->nome,
            'attivo'       => $this->attivo,
            'motivo'       => $this->motivo,
            'at'           => now()->toIso8601String(),
        ];
    }
}
