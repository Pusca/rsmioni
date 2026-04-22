/**
 * Printer Adapter
 *
 * Milestone M6: implementare stampa reale via SumatraPDF o win32 API.
 */

function createPrinterAdapter(type) {
    return type === 'mock' ? new MockPrinterAdapter() : new RealPrinterAdapter();
}

class MockPrinterAdapter {
    status() {
        return { type: 'mock', ready: true };
    }

    async print({ url }) {
        await new Promise(r => setTimeout(r, 500));
        console.log(`[printer:mock] Stampa simulata: ${url}`);
        return { ok: true };
    }
}

class RealPrinterAdapter {
    status() {
        return { type: 'real', ready: false, note: 'TODO M6' };
    }

    async print({ url }) {
        // TODO M6: SumatraPDF -print-to-default <file>
        throw new Error('Printer adapter non ancora implementato (M6)');
    }
}

module.exports = { createPrinterAdapter };
