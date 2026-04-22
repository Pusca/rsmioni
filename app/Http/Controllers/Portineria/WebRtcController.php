<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\StatoChiosco;
use App\Events\WebRtcSessionCreata;
use App\Events\WebRtcSignal;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\PortineriaService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * API WebRTC per il parlato receptionist ↔ chiosco.
 *
 * POST /portineria/webrtc/sessione
 *   → Crea sessione, transisce a in_parlato, notifica il chiosco, restituisce session_id.
 *
 * POST /portineria/webrtc/signal
 *   → Relay di un segnale SDP/ICE dal receptionist al chiosco (mittente='receptionist').
 *     Tipi ammessi: offer, ice-candidate.
 *
 * POST /portineria/webrtc/chiudi
 *   → Invia 'sessione_chiusa' al chiosco, elimina sessione, riporta in in_chiaro.
 */
class WebRtcController extends Controller
{
    public function __construct(
        private readonly PortineriaService    $portineria,
        private readonly WebRtcSessionService $webRtcSession,
    ) {}

    /**
     * Crea una sessione WebRTC e porta il chiosco in in_parlato.
     * Richiede che il chiosco sia attualmente in_chiaro.
     */
    public function creaSessione(Request $request): JsonResponse
    {
        $request->validate([
            'chiosco_id' => ['required', 'string', 'uuid'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        // Solo da in_chiaro → in_parlato
        $statoAttuale = $this->portineria->statoChiosco($chiosco->id);
        if ($statoAttuale !== StatoChiosco::InChiaro) {
            return response()->json([
                'error'   => 'Il parlato è avviabile solo da collegamento in chiaro.',
                'attuale' => $statoAttuale->value,
            ], 422);
        }

        $ok = $this->portineria->transizione(
            $chiosco,
            StatoChiosco::InParlato,
            $request->user()->profilo,
        );

        if (! $ok) {
            return response()->json(['error' => 'Transizione non consentita.'], 422);
        }

        $sessionId = $this->webRtcSession->crea(
            $request->user()->id,
            $chiosco->id,
            $chiosco->hotel_id,
            'parlato',
        );

        // Notifica il browser del chiosco che c'è una nuova sessione WebRTC
        try {
            broadcast(new WebRtcSessionCreata($chiosco->id, $sessionId, 'parlato'));
        } catch (\Throwable) {
            // Reverb non attivo — il chiosco non riceverà la notifica realtime;
            // in dev usa il demo toolbar per simulare, in prod Reverb deve essere attivo.
        }

        return response()->json([
            'session_id' => $sessionId,
            'chiosco_id' => $chiosco->id,
        ]);
    }

    /**
     * Relay di un segnale WebRTC dal receptionist al chiosco.
     * Tipi ammessi: offer, ice-candidate.
     */
    public function signal(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['required', 'string'],
            'tipo'       => ['required', 'in:offer,ice-candidate,screen_share_started,screen_share_stopped'],
            'payload'    => ['present', 'array'],
        ]);

        if (! $this->webRtcSession->appartiene($request->session_id, $request->user()->id)) {
            return response()->json(['error' => 'Sessione non valida o scaduta.'], 403);
        }

        try {
            broadcast(new WebRtcSignal(
                $request->session_id,
                $request->tipo,
                $request->payload,
                'receptionist',
            ));
        } catch (\Throwable) {
            // Reverb non in esecuzione — in dev è normale
        }

        return response()->json(['ok' => true]);
    }

    /**
     * Chiude la sessione WebRTC e riporta il chiosco in in_chiaro.
     *
     * Prima invia il segnale 'sessione_chiusa' al chiosco via Reverb,
     * poi elimina la sessione dalla Cache e cambia stato.
     */
    public function chiudi(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['required', 'string'],
            'chiosco_id' => ['required', 'string', 'uuid'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! in_array($chiosco->hotel_id, $request->user()->hotelIds(), true)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        // Prima del delete: notifica il chiosco che la sessione è terminata
        try {
            broadcast(new WebRtcSignal(
                $request->session_id,
                'sessione_chiusa',
                [],
                'receptionist',
            ));
        } catch (\Throwable) { /* Reverb non attivo */ }

        // Poi elimina la sessione dalla Cache
        $this->webRtcSession->chiudi($request->session_id);

        // Torna in chiaro (se ancora in parlato)
        $statoAttuale = $this->portineria->statoChiosco($chiosco->id);
        if ($statoAttuale === StatoChiosco::InParlato) {
            $this->portineria->transizione(
                $chiosco,
                StatoChiosco::InChiaro,
                $request->user()->profilo,
            );
        }

        return response()->json(['ok' => true]);
    }
}
