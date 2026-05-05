<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Restituisce i server ICE (STUN + TURN) per RTCPeerConnection.
 *
 * Le credenziali TURN vengono fetchate dall'API Metered.ca e cachate
 * per 50 minuti (le credenziali hanno TTL 1 ora).
 *
 * GET /webrtc/ice-servers
 */
class WebRtcIceServersController extends Controller
{
    public function index(): JsonResponse
    {
        $apiKey  = config('services.metered.api_key');
        $appName = config('services.metered.app_name');

        // Fallback STUN-only se Metered non è configurato
        if (! $apiKey || ! $appName) {
            return response()->json([
                ['urls' => 'stun:stun.l.google.com:19302'],
                ['urls' => 'stun:stun1.l.google.com:19302'],
            ]);
        }

        $servers = Cache::remember('webrtc_ice_servers', 3000, function () use ($apiKey, $appName) {
            try {
                $response = Http::timeout(5)
                    ->get("https://{$appName}.metered.live/api/v1/turn/credentials", [
                        'apiKey' => $apiKey,
                    ]);

                if ($response->successful()) {
                    return $response->json();
                }

                Log::warning('[IceServers] Metered API error', [
                    'status' => $response->status(),
                    'body'   => $response->body(),
                ]);
            } catch (\Throwable $e) {
                Log::warning('[IceServers] Metered fetch failed: ' . $e->getMessage());
            }

            // Fallback statico se l'API non risponde
            return [
                ['urls' => 'stun:stun.relay.metered.ca:80'],
                ['urls' => 'turn:global.relay.metered.ca:80',              'username' => config('services.metered.username'), 'credential' => config('services.metered.credential')],
                ['urls' => 'turn:global.relay.metered.ca:80?transport=tcp','username' => config('services.metered.username'), 'credential' => config('services.metered.credential')],
                ['urls' => 'turn:global.relay.metered.ca:443',             'username' => config('services.metered.username'), 'credential' => config('services.metered.credential')],
                ['urls' => 'turns:global.relay.metered.ca:443?transport=tcp','username' => config('services.metered.username'), 'credential' => config('services.metered.credential')],
            ];
        });

        return response()->json($servers);
    }
}
