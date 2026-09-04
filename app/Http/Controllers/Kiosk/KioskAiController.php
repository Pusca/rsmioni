<?php

namespace App\Http\Controllers\Kiosk;

use App\Enums\StatoChiosco;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Services\LiveKitDispatchService;
use App\Services\PortineriaService;
use App\Services\WebRtcSessionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

/**
 * Self check-in AI dal chiosco (docs/09 — FASE 2).
 *
 * POST /kiosk/ai/avvia {scopo: checkin|info}
 *   L'ospite tocca "Esegui il check-in" o "Richiedi informazioni":
 *   crea una sessione 'parlato' gestita_da='ai', porta il chiosco in
 *   in_parlato (visibile in Portineria, che si aggancia in nascosto) e
 *   dispaccia l'agent AI sulla stanza. Il chiosco si connette col normale
 *   polling del token LiveKit.
 *
 * POST /kiosk/ai/termina
 *   L'ospite chiude la conversazione: elimina la sessione e torna Idle.
 */
class KioskAiController extends Controller
{
    public function __construct(
        private readonly WebRtcSessionService   $sessioni,
        private readonly PortineriaService      $portineria,
        private readonly LiveKitDispatchService $dispatch,
    ) {}

    public function avvia(Request $request): JsonResponse
    {
        $request->validate([
            'scopo'  => ['required', Rule::in(['checkin', 'info', 'checkout'])],
            // Lingua scelta dall'ospite sul chiosco (bandierine); se assente o
            // non abilitata per l'hotel, si parte dalla lingua di default.
            'lingua' => ['nullable', 'string', 'size:2'],
        ]);

        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['error' => 'Nessun chiosco selezionato.'], 403);
        }

        $chiosco = Chiosco::with('hotel')->findOrFail($chioscoId);

        // Consentito da idle/offline e ANCHE da in_nascosto: un monitoraggio
        // covert (o una sessione rimasta appesa) non deve bloccare l'ospite.
        // La vecchia sessione viene chiusa; la Portineria si riaggancia da
        // sola in osservazione sulla nuova sessione AI (recoverCalls).
        $stato           = $this->portineria->statoChiosco($chiosco->id);
        $vecchiaSessione = $this->sessioni->sessioneAttivaPerChiosco($chiosco->id);
        $vecchiaAi       = $vecchiaSessione
            && (($this->sessioni->trova($vecchiaSessione)['gestita_da'] ?? 'umano') === 'ai');

        // Consentito anche da in_parlato SE la sessione appesa è dell'AI: un
        // agent caduto (o un chiosco scollegato) non deve lasciare il chiosco
        // bloccato con i bottoni che rispondono "già impegnato". Se invece il
        // parlato è di un receptionist umano, resta il rifiuto.
        $ripartenzaAi = $stato === StatoChiosco::InParlato && $vecchiaAi;

        if (! $ripartenzaAi && ! in_array($stato, [StatoChiosco::Idle, StatoChiosco::Offline, StatoChiosco::InNascosto], true)) {
            return response()->json([
                'error'   => 'Il chiosco è già impegnato in un collegamento.',
                'attuale' => $stato->value,
            ], 422);
        }
        if ($vecchiaSessione) {
            $this->sessioni->chiudi($vecchiaSessione);
        }

        $lingua = $this->linguaConversazione($chiosco, $request->input('lingua'));

        $sessionId = $this->sessioni->crea(
            receptionistId: $request->user()->id, // account chiosco: "conduce" la sessione AI
            chioscoId:      $chiosco->id,
            hotelId:        $chiosco->hotel_id,
            tipo:           'parlato',
            gestitaDa:      'ai',
        );

        try {
            $this->dispatch->dispatch($sessionId, [
                'scopo'        => $request->scopo,
                'session_id'   => $sessionId,
                'chiosco_id'   => $chiosco->id,
                'chiosco_nome' => $chiosco->nome,
                'hotel_id'     => $chiosco->hotel_id,
                'hotel_nome'   => $chiosco->hotel?->nome,
                'lingua'       => $lingua,
                'checkout_ora' => $chiosco->hotel?->checkout_ora,
                // docs/11: senza walk-in l'AI lavora solo su prenotazioni esistenti
                'walkin'           => (bool) ($chiosco->hotel?->ai_walkin_abilitato ?? true),
                'istruzioni_hotel' => $chiosco->hotel?->istruzioni_ai,
            ]);
        } catch (\Throwable $e) {
            // Niente agent → niente sessione fantasma: pulizia e errore onesto
            $this->sessioni->chiudi($sessionId);
            Log::warning('Dispatch AI fallito', ['chiosco' => $chiosco->id, 'errore' => $e->getMessage()]);

            return response()->json([
                'error' => "L'assistente vocale non è al momento disponibile. Chiama il receptionist.",
            ], 503);
        }

        // Stato forzato (impostaStato): l'avvio AI parte dal chiosco stesso,
        // fuori dalla matrice profili della Portineria. Broadcast incluso.
        $this->portineria->impostaStato($chiosco, StatoChiosco::InParlato);

        return response()->json([
            'ok'         => true,
            'session_id' => $sessionId,
            'scopo'      => $request->scopo,
            'lingua'     => $lingua,
        ]);
    }

    /** Lingua di apertura della conversazione: quella scelta se abilitata, altrimenti il default dell'hotel. */
    private function linguaConversazione(Chiosco $chiosco, ?string $scelta): string
    {
        $default  = $chiosco->hotel?->lingua_default ?: 'it';
        $abilitate = $chiosco->hotel?->lingue_abilitate ?: [$default];
        $scelta    = $scelta ? strtolower($scelta) : null;

        return $scelta && in_array($scelta, $abilitate, true) ? $scelta : $default;
    }

    public function termina(): JsonResponse
    {
        $chioscoId = session('chiosco_id');
        if (! $chioscoId) {
            return response()->json(['error' => 'Nessun chiosco selezionato.'], 403);
        }

        $chiosco   = Chiosco::findOrFail($chioscoId);
        $sessionId = $this->sessioni->sessioneAttivaPerChiosco($chiosco->id);

        if ($sessionId) {
            $sessione = $this->sessioni->trova($sessionId);
            if (($sessione['gestita_da'] ?? 'umano') !== 'ai') {
                return response()->json(['error' => 'La sessione è gestita dal receptionist.'], 422);
            }
            $this->sessioni->chiudi($sessionId);
        }

        $this->portineria->impostaStato($chiosco, StatoChiosco::Idle);

        return response()->json(['ok' => true]);
    }
}
