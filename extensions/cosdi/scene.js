'use strict';

exports.load = function () {};
exports.unload = function () {};

exports.methods = {
    getDiagnostics() {
        const snapshot = globalThis.__COSDI_DIAGNOSTICS__;
        if (snapshot && (snapshot.scopes || snapshot.benchmark)) {
            return snapshot;
        }
        return { scopes: [], collectedAt: Date.now(), empty: true };
    },
};
