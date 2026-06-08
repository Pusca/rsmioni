<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    // ── Metered.ca — TURN server per WebRTC ───────────────────────────────
    // Credenziali da https://<app>.metered.live/o/dashboard
    'metered' => [
        'api_key'    => env('METERED_API_KEY'),
        'app_name'   => env('METERED_APP_NAME', 'rsmioni'),
        'username'   => env('METERED_TURN_USERNAME'),
        'credential' => env('METERED_TURN_CREDENTIAL'),
    ],

    // ── LiveKit Cloud — media WebRTC gestito (signaling + SFU + TURN) ──────
    // Credenziali da https://cloud.livekit.io (progetto → API Keys).
    // LIVEKIT_URL è il WebSocket del progetto, es. wss://nome.livekit.cloud
    'livekit' => [
        'api_key'    => env('LIVEKIT_API_KEY'),
        'api_secret' => env('LIVEKIT_API_SECRET'),
        'url'        => env('LIVEKIT_URL'),
    ],

];
