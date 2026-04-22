/**
 * Bell (campanello) Adapter
 *
 * Milestone M6: implementare campanello reale via GPIO/COM o comando Windows.
 */

function createBellAdapter(type) {
    return type === 'mock' ? new MockBellAdapter() : new RealBellAdapter();
}

class MockBellAdapter {
    status() {
        return { type: 'mock', ready: true };
    }

    async ring() {
        console.log('[bell:mock] DING DONG');
    }
}

class RealBellAdapter {
    status() {
        return { type: 'real', ready: false, note: 'TODO M6' };
    }

    async ring() {
        // TODO M6: serial/GPIO command to physical bell
        throw new Error('Bell adapter non ancora implementato (M6)');
    }
}

module.exports = { createBellAdapter };
