<?php

use App\Enums\Profilo;
use App\Models\Chiosco;
use App\Services\WebRtcSessionService;
use Illuminate\Support\Facades\Broadcast;

/*
|--------------------------------------------------------------------------
| Broadcast Channels — RS Mioni / Reverb
|--------------------------------------------------------------------------
|
| Struttura canali:
|   portineria.{hotelId}    — private, Receptionist/ReceptionistLite dello stesso hotel
|   chiosco.{chioscoId}     — private, utenti dello stesso hotel (receptionist + chiosco)
|   webrtc.{sessionId}      — private, P2P WebRTC signaling (receptionist + chiosco della sessione)
|
*/

/**
 * Canale Portineria per hotel.
 * Ascoltato dai Receptionist per aggiornamenti realtime degli stati chiosco.
 */
Broadcast::channel('portineria.{hotelId}', function ($user, string $hotelId) {
    return in_array($hotelId, $user->hotelIds(), true)
        && in_array($user->profilo->value, ['receptionist', 'receptionist_lite'], true);
});

/**
 * Canale chiosco-specifico.
 * Usato per notifiche WebRTC al browser chiosco (WebRtcSessionCreata).
 * Accessibile a qualsiasi utente il cui hotel contiene quel chiosco.
 */
Broadcast::channel('chiosco.{chioscoId}', function ($user, string $chioscoId) {
    $chiosco = Chiosco::find($chioscoId);
    if (! $chiosco) {
        return false;
    }

    return in_array($chiosco->hotel_id, $user->hotelIds(), true);
});

/**
 * Canale WebRTC signaling — sessione P2P ephemera.
 *
 * Accesso consentito:
 *   - Receptionist: è il creatore della sessione (receptionist_id in Cache).
 *   - Chiosco: il chiosco selezionato in sessione PHP coincide con il chiosco della sessione.
 *
 * L'autenticazione usa session('chiosco_id') (sessione PHP del browser kiosk)
 * che viene impostata al momento della selezione in /kiosk/seleziona.
 */
Broadcast::channel('webrtc.{sessionId}', function ($user, string $sessionId) {
    /** @var WebRtcSessionService $service */
    $service = app(WebRtcSessionService::class);
    $session = $service->trova($sessionId);

    if (! $session) {
        return false;
    }

    // Receptionist: è il creatore della sessione
    if ($session['receptionist_id'] === $user->id) {
        return true;
    }

    // Chiosco: l'utente ha questo chiosco selezionato nella sessione PHP
    if ($user->profilo === Profilo::Chiosco) {
        $chioscoSelezionato = session('chiosco_id');
        return $chioscoSelezionato !== null
            && $chioscoSelezionato === $session['chiosco_id'];
    }

    return false;
});
