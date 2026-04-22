<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Broadcasting\PrivateChannel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

/**
 * Relay di un messaggio di signaling WebRTC tra receptionist e chiosco.
 * Canale: webrtc.{sessionId} (private, ephemero)
 *
 * Tipi: offer | answer | ice-candidate
 * Mittente: 'receptionist' | 'chiosco'
 *
 * Usato da WebRtcController::signal() per inoltare SDP/ICE al peer remoto.
 */
class WebRtcSignal implements ShouldBroadcastNow
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $sessionId,
        public readonly string $tipo,      // 'offer' | 'answer' | 'ice-candidate'
        public readonly array  $payload,
        public readonly string $mittente,  // 'receptionist' | 'chiosco'
    ) {}

    public function broadcastOn(): array
    {
        return [
            new PrivateChannel("webrtc.{$this->sessionId}"),
        ];
    }

    public function broadcastAs(): string
    {
        return 'webrtc.signal';
    }

    public function broadcastWith(): array
    {
        return [
            'tipo'      => $this->tipo,
            'payload'   => $this->payload,
            'mittente'  => $this->mittente,
        ];
    }
}
