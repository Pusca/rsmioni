<?php

namespace App\Http\Controllers\Portineria;

use App\Enums\StatoChiosco;
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
     *
     * Il receptionist si collega al chiosco direttamente a voce e video: il
     * "chiaro" (solo video) non è più un passaggio obbligato. Si parte da
     * idle, chiamata in arrivo, nascosto, messaggio di attesa o chiaro; lo
     * stato attraversa in_chiaro solo come tappa interna della state machine
     * (le regole per profilo e il limite di sessioni concorrenti valgono
     * comunque). Un'eventuale sessione media precedente del chiosco
     * (nascosto/chiaro) viene chiusa: il chiosco si riaggancia alla nuova.
     */
    public function creaSessione(Request $request): JsonResponse
    {
        $request->validate([
            'chiosco_id' => ['required', 'string', 'uuid'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! $request->user()->possiedeHotel($chiosco->hotel_id)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        $statoAttuale = $this->portineria->statoChiosco($chiosco->id);
        $profilo      = $request->user()->profilo;

        if ($statoAttuale === StatoChiosco::InParlato) {
            return response()->json([
                'error'   => 'Il chiosco è già in parlato.',
                'attuale' => $statoAttuale->value,
            ], 422);
        }

        if ($statoAttuale !== StatoChiosco::InChiaro) {
            if (! $this->portineria->transizione($chiosco, StatoChiosco::InChiaro, $profilo)) {
                return response()->json([
                    'error'   => $this->portineria->ultimoMotivoRifiuto() ?? 'Il parlato non è avviabile da questo stato.',
                    'attuale' => $statoAttuale->value,
                ], 422);
            }
        }

        if (! $this->portineria->transizione($chiosco, StatoChiosco::InParlato, $profilo)) {
            return response()->json(['error' => 'Transizione non consentita.'], 422);
        }

        // Sessione media precedente (nascosto/chiaro): crea() la sovrascrive
        // nell'indice per chiosco, ma va chiusa esplicitamente per liberare la
        // cache e far ricadere il chiosco sulla nuova stanza.
        $precedente = $this->webRtcSession->sessioneAttivaPerChiosco($chiosco->id);
        if ($precedente) {
            $this->webRtcSession->chiudi($precedente);
        }

        $sessionId = $this->webRtcSession->crea(
            $request->user()->id,
            $chiosco->id,
            $chiosco->hotel_id,
            'parlato',
        );

        // Il chiosco scopre la sessione tramite polling su /kiosk/webrtc/sessione-corrente

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

        $this->webRtcSession->accoda(
            $request->session_id,
            'chiosco',
            $request->tipo,
            $request->payload,
            'receptionist',
        );

        return response()->json(['ok' => true]);
    }

    /**
     * Chiude la sessione WebRTC e riporta il chiosco in in_chiaro.
     *
     * Accoda 'sessione_chiusa' nella coda segnali del chiosco,
     * poi elimina la sessione dalla Cache e cambia stato.
     */
    public function chiudi(Request $request): JsonResponse
    {
        $request->validate([
            'session_id' => ['required', 'string'],
            'chiosco_id' => ['required', 'string', 'uuid'],
        ]);

        $chiosco = Chiosco::findOrFail($request->chiosco_id);

        if (! $request->user()->possiedeHotel($chiosco->hotel_id)) {
            return response()->json(['error' => 'Accesso non consentito'], 403);
        }

        // Accoda il segnale prima di eliminare la sessione
        $this->webRtcSession->accoda(
            $request->session_id,
            'chiosco',
            'sessione_chiusa',
            [],
            'receptionist',
        );

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

    /**
     * Polling dei segnali WebRTC pendenti per il receptionist.
     *
     * GET /portineria/webrtc/{sessionId}/poll
     * Restituisce e svuota tutti i segnali accodati per il receptionist.
     */
    public function poll(Request $request, string $sessionId): JsonResponse
    {
        // Se la sessione esiste, verifica che appartenga al receptionist.
        // Se la sessione è stata appena chiusa (chiudi()), restituisce
        // comunque gli ultimi segnali in coda.
        $session = $this->webRtcSession->trova($sessionId);

        if ($session && ! $this->webRtcSession->appartiene($sessionId, $request->user()->id)) {
            return response()->json(['signals' => []], 403);
        }

        $signals = $this->webRtcSession->preleva($sessionId, 'receptionist');

        return response()->json(['signals' => $signals])
            ->header('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
}
