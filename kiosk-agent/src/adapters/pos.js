/**
 * POS Adapter
 *
 * Supporta due implementazioni reali (file-based, come da manuale RH24):
 *   - ingenico: legge/scrive file SRINPF.TXT / SROUTF.TXT
 *   - mypos:    legge/scrive file dedicati MyPOS
 *
 * In assenza di hardware, usa il mock che risponde sempre OK.
 *
 * Milestone M4: implementare ingenico e mypos.
 */

function createPOSAdapter(type) {
    switch (type) {
        case 'ingenico':
            return new IngenicoAdapter();
        case 'mypos':
            return new MyPOSAdapter();
        default:
            return new MockPOSAdapter();
    }
}

class MockPOSAdapter {
    status() {
        return { type: 'mock', ready: true };
    }

    async pay({ importo, valuta }) {
        // Simula latenza POS (2s)
        await new Promise(r => setTimeout(r, 2000));
        return {
            esito:             'ok',
            importo_effettivo: importo,
            valuta,
            timestamp:         new Date().toISOString(),
        };
    }
}

class IngenicoAdapter {
    constructor() {
        this.inputPath  = process.env.POS_INPUT_PATH  ?? 'C:\\ProgramData\\RTSDoremiPos\\SRINPF.TXT';
        this.outputPath = process.env.POS_OUTPUT_PATH ?? 'C:\\ProgramData\\RTSDoremiPos\\SROUTF.TXT';
    }

    status() {
        return { type: 'ingenico', ready: false, note: 'TODO M4' };
    }

    async pay({ importo, valuta }) {
        // TODO M4: write SRINPF.TXT, poll SROUTF.TXT for result
        throw new Error('Ingenico adapter non ancora implementato (M4)');
    }
}

class MyPOSAdapter {
    status() {
        return { type: 'mypos', ready: false, note: 'TODO M4' };
    }

    async pay({ importo, valuta }) {
        // TODO M4: integrate MyPOS file protocol
        throw new Error('MyPOS adapter non ancora implementato (M4)');
    }
}

module.exports = { createPOSAdapter };
