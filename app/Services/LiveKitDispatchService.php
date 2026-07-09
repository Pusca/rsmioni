<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Dispatch esplicito dell'agent AI (worker LiveKit Agents) su una stanza.
 *
 * Il worker Python si registra con agent_name = 'ai-receptionist' (dispatch
 * esplicito: NON entra più da solo in tutte le stanze). Quando Laravel vuole
 * l'AI su una sessione chiama CreateDispatch (API Twirp di LiveKit) passando
 * la stanza (= sessionId) e un metadata JSON con il contesto di dominio
 * (scopo, hotel, chiosco, lingua) che l'agent legge da ctx.job.metadata.
 *
 * Doc: https://docs.livekit.io/agents/worker/agent-dispatch/
 */
class LiveKitDispatchService
{
    public const AGENT_NAME = 'ai-receptionist';

    public function __construct(private readonly LiveKitTokenService $token) {}

    /**
     * Richiede il dispatch dell'agent sulla stanza. Lancia RuntimeException
     * se LiveKit non è configurato o la chiamata API fallisce.
     *
     * @param array<string, mixed> $metadata Contesto passato all'agent (JSON)
     */
    public function dispatch(string $room, array $metadata = []): void
    {
        $wsUrl = config('services.livekit.url');
        if (! $this->token->configurato() || ! $wsUrl) {
            throw new RuntimeException('LiveKit non configurato: dispatch AI impossibile.');
        }

        // L'endpoint API è lo stesso host del WebSocket, in HTTPS
        $apiUrl = str_replace(['wss://', 'ws://'], ['https://', 'http://'], $wsUrl);

        $response = Http::withToken($this->adminToken($room))
            ->acceptJson()
            ->post("{$apiUrl}/twirp/livekit.AgentDispatchService/CreateDispatch", [
                'agent_name' => self::AGENT_NAME,
                'room'       => $room,
                'metadata'   => json_encode($metadata, JSON_UNESCAPED_UNICODE),
            ]);

        if (! $response->successful()) {
            throw new RuntimeException(
                'Dispatch agent AI fallito: HTTP ' . $response->status() . ' — ' . $response->body()
            );
        }
    }

    /**
     * Rimuove l'agent AI dalla stanza (subentro umano): l'agent viene
     * disconnesso dal server LiveKit e il suo job termina. Best-effort.
     */
    public function rimuoviAgent(string $room): void
    {
        $wsUrl = config('services.livekit.url');
        if (! $wsUrl) {
            return;
        }
        $apiUrl = str_replace(['wss://', 'ws://'], ['https://', 'http://'], $wsUrl);
        $token  = $this->adminToken($room);

        $participants = Http::withToken($token)->acceptJson()
            ->post("{$apiUrl}/twirp/livekit.RoomService/ListParticipants", ['room' => $room])
            ->json('participants') ?? [];

        foreach ($participants as $p) {
            $isAgent = ($p['kind'] ?? '') === 'AGENT' || str_starts_with($p['identity'] ?? '', 'agent-');
            if ($isAgent) {
                Http::withToken($token)->acceptJson()
                    ->post("{$apiUrl}/twirp/livekit.RoomService/RemoveParticipant", [
                        'room'     => $room,
                        'identity' => $p['identity'],
                    ]);
            }
        }
    }

    /**
     * JWT con grant roomAdmin sulla stanza — richiesto dall'API di dispatch.
     * Stessa struttura dei token generati da LiveKitTokenService.
     */
    private function adminToken(string $room): string
    {
        $apiKey    = config('services.livekit.api_key');
        $apiSecret = config('services.livekit.api_secret');

        $now = time();
        $header  = ['alg' => 'HS256', 'typ' => 'JWT'];
        $payload = [
            'iss'   => $apiKey,
            'sub'   => 'rsmioni-backend',
            'nbf'   => $now,
            'exp'   => $now + 60, // usa-e-getta: serve solo per questa chiamata API
            'video' => [
                'room'      => $room,
                'roomAdmin' => true,
            ],
        ];

        $b64 = fn (string $d) => rtrim(strtr(base64_encode($d), '+/', '-_'), '=');

        $segments   = [$b64(json_encode($header, JSON_UNESCAPED_SLASHES)), $b64(json_encode($payload, JSON_UNESCAPED_SLASHES))];
        $segments[] = $b64(hash_hmac('sha256', implode('.', $segments), $apiSecret, true));

        return implode('.', $segments);
    }
}
