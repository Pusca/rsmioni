<?php

namespace App\Services;

use RuntimeException;

/**
 * Genera access token (JWT HS256) per LiveKit Cloud.
 *
 * Un access token LiveKit è un JWT firmato con l'API Secret del progetto.
 * Il claim "video" (VideoGrant) definisce i permessi nella stanza:
 *   - room / roomJoin: a quale stanza ci si può unire
 *   - canPublish:      se l'identità può pubblicare track (audio/video/schermo)
 *   - canSubscribe:    se può ricevere le track altrui
 *
 * Implementazione in PHP puro (hash_hmac) per evitare dipendenze composer
 * aggiuntive: il token è uno standard JWT, non serve l'SDK ufficiale.
 *
 * Doc claim: https://docs.livekit.io/home/get-started/authentication/
 */
class LiveKitTokenService
{
    /** TTL del token in secondi (durata massima di una sessione). */
    private const TTL = 3600; // 1 ora

    public function configurato(): bool
    {
        return (bool) (config('services.livekit.api_key')
            && config('services.livekit.api_secret')
            && config('services.livekit.url'));
    }

    public function url(): ?string
    {
        return config('services.livekit.url');
    }

    /**
     * Genera un access token per una stanza.
     *
     * @param string $room        Nome stanza (= sessionId della sessione chiosco)
     * @param string $identity    Identità univoca del partecipante (user id / chiosco id)
     * @param string $nome        Nome visualizzato
     * @param bool   $canPublish  Se può pubblicare track (false = solo visione, es. nascosto)
     */
    public function genera(string $room, string $identity, string $nome, bool $canPublish): string
    {
        $apiKey    = config('services.livekit.api_key');
        $apiSecret = config('services.livekit.api_secret');

        if (! $apiKey || ! $apiSecret) {
            throw new RuntimeException('LiveKit non configurato (LIVEKIT_API_KEY / LIVEKIT_API_SECRET mancanti).');
        }

        $now = time();

        $header = ['alg' => 'HS256', 'typ' => 'JWT'];

        $payload = [
            'iss'  => $apiKey,             // API Key come issuer
            'sub'  => $identity,
            'name' => $nome,
            'nbf'  => $now,
            'exp'  => $now + self::TTL,
            'video' => [
                'room'           => $room,
                'roomJoin'       => true,
                'canPublish'     => $canPublish,
                'canSubscribe'   => true,
                'canPublishData' => true,
            ],
        ];

        $segments = [
            $this->base64UrlEncode(json_encode($header,  JSON_UNESCAPED_SLASHES)),
            $this->base64UrlEncode(json_encode($payload, JSON_UNESCAPED_SLASHES)),
        ];

        $signingInput = implode('.', $segments);
        $signature    = hash_hmac('sha256', $signingInput, $apiSecret, true);
        $segments[]   = $this->base64UrlEncode($signature);

        return implode('.', $segments);
    }

    private function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
}
