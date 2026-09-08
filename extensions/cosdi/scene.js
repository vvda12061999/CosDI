'use strict';

exports.methods = {
    getDiagnostics() {
        const snapshot = globalThis.__COSDI_DIAGNOSTICS__;
        if (snapshot) {
            return snapshot;
        }
        return { scopes: [], collectedAt: Date.now(), empty: true };
    },
};
