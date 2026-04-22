/**
 * RS Mioni — Kiosk Agent locale (Windows)
 *
 * Processo Node.js che gira sul PC del chiosco.
 * Responsabilità:
 *   - Comunicazione con il server RS Mioni via WebSocket (Laravel Reverb)
 *   - Controllo hardware locale: POS, stampante, campanello
 *   - Esposizione HTTP API locale per il browser kiosk (localhost:7700)
 *
 * Milestone M1: struttura base + adapter stub
 * Milestone M2: integrazione WebRTC signaling
 * Milestone M4: integrazione POS reale (Ingenico/MyPOS file-based)
 * Milestone M6: integrazione stampante e campanello
 */

const express = require('express');
const { createPOSAdapter }       = require('./adapters/pos');
const { createPrinterAdapter }   = require('./adapters/printer');
const { createBellAdapter }      = require('./adapters/bell');
const { createReverbConnection } = require('./services/reverb');

const PORT = process.env.KIOSK_PORT ?? 7700;
const app  = express();

app.use(express.json());

// ── Stato interno ──────────────────────────────────────────────────────────
const state = {
    chioscoId:  process.env.CHIOSCO_ID ?? null,
    serverUrl:  process.env.SERVER_URL ?? 'http://localhost:8000',
    connected:  false,
};

// ── Adapter hardware (mock in assenza di hardware) ─────────────────────────
const pos     = createPOSAdapter(process.env.POS_TYPE ?? 'mock');
const printer = createPrinterAdapter(process.env.PRINTER_TYPE ?? 'mock');
const bell    = createBellAdapter(process.env.BELL_TYPE ?? 'mock');

// ── API locale (chiamate dal browser kiosk) ────────────────────────────────

/** Stato del chiosco: connessione, hardware */
app.get('/status', (req, res) => {
    res.json({
        chioscoId: state.chioscoId,
        connected: state.connected,
        hardware: {
            pos:     pos.status(),
            printer: printer.status(),
            bell:    bell.status(),
        },
    });
});

/** Avvia transazione POS */
app.post('/pos/pay', async (req, res) => {
    const { importo, valuta = 'EUR' } = req.body;
    try {
        const result = await pos.pay({ importo, valuta });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Stampa documento */
app.post('/printer/print', async (req, res) => {
    const { url } = req.body;
    try {
        const result = await printer.print({ url });
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

/** Suona campanello */
app.post('/bell/ring', async (req, res) => {
    try {
        await bell.ring();
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── Avvio ──────────────────────────────────────────────────────────────────
app.listen(PORT, '127.0.0.1', () => {
    console.log(`[kiosk-agent] Listening on http://127.0.0.1:${PORT}`);
    console.log(`[kiosk-agent] Server: ${state.serverUrl}`);
    console.log(`[kiosk-agent] Chiosco ID: ${state.chioscoId ?? '(not set)'}`);

    // TODO M1: createReverbConnection(state) per ascolto eventi dal server
});
