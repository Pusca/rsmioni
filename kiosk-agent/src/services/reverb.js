/**
 * Reverb (WebSocket) connection service
 *
 * Connette il kiosk-agent al server Laravel Reverb per ricevere eventi:
 *   - chiamata in arrivo dal receptionist
 *   - richiesta pagamento POS
 *   - richiesta stampa documento
 *
 * Milestone M1: implementare connessione e handling eventi base.
 */

function createReverbConnection(state) {
    // TODO M1: connect via pusher-js to Reverb
    // const Pusher = require('pusher-js');
    // const echo   = new (require('laravel-echo'))({...});
    console.log('[reverb] TODO M1: WebSocket connection stub');
    return null;
}

module.exports = { createReverbConnection };
