<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Notifica al browser del chiosco che una sessione WebRTC è stata aperta.
 * Canale: chiosco.{chioscoId} (private)
 *
 * Il chiosco lo riceve, si abbona a webrtc.{sessionId} e avvia la negoziazione
 * rispondendo con il segnale 'chiosco_ready'.
 */
class WebRtcSessionCreata implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    /**
     * @param string $tipo 'chiaro' | 'nascosto' | 'parlato'
     */
    public function __construct(
        public readonly string $chioscoId,
        public readonly string $sessionId,
        public readonly string $tipo = 'parlato',
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("chiosco.{$this->chioscoId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'webrtc.sessione_creata';
    }

    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->sessionId,
            'chiosco_id' => $this->chioscoId,
            'tipo'       => $this->tipo,
        ];
    }
}
