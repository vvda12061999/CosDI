'use strict';

const http = require('http');

const PORT = 38477;
const PANEL = 'cosdi-diagnostics';

let snapshot = { scopes: [], collectedAt: 0, empty: true };
let server = null;
let lastLogKey = '';

function applyCors(req, res) {
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
}

function startServer() {
    if (server) {
        return;
    }
    server = http.createServer((req, res) => {
        applyCors(req, res);
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = String(req.url || '').split('?')[0];
        if (url !== '/diagnostics' && url !== '/') {
            res.writeHead(404);
            res.end();
            return;
        }

        if (req.method === 'POST') {
            const chunks = [];
            req.on('data', (chunk) => chunks.push(chunk));
            req.on('end', () => {
                try {
                    const raw = Buffer.concat(chunks);
                    if (raw.length > 512 * 1024) {
                        console.warn('[CosDI] Dropped oversized diagnostics payload (' + raw.length + ' bytes)');
                        res.writeHead(204);
                        res.end();
                        return;
                    }
                    const parsed = JSON.parse(raw.toString('utf8') || '{}');
                    if (parsed && typeof parsed === 'object') {
                        snapshot = parsed;
                        snapshot.empty = (!snapshot.scopes || snapshot.scopes.length === 0) && !snapshot.benchmark;
                        const key = String(snapshot.collectedAt || 0) + ':' + (snapshot.scopes ? snapshot.scopes.length : 0)
                            + ':' + (snapshot.benchmark && snapshot.benchmark.status ? snapshot.benchmark.status : '');
                        if (key !== lastLogKey && snapshot.scopes && snapshot.scopes.length) {
                            lastLogKey = key;
                            console.log('[CosDI] Received diagnostics from play/preview (' + snapshot.scopes.length + ' scope' + (snapshot.scopes.length === 1 ? '' : 's') + ')');
                        }
                    }
                } catch (error) {
                    console.warn('[CosDI] Invalid diagnostics payload', error);
                }
                res.writeHead(204);
                res.end();
            });
            return;
        }

        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(snapshot));
            return;
        }

        res.writeHead(405);
        res.end();
    });

    server.on('error', (error) => {
        if (error && error.code === 'EADDRINUSE') {
            console.warn('[CosDI] Port ' + PORT + ' is already in use. Diagnostics will reuse the existing listener.');
            server = null;
            return;
        }
        console.error('[CosDI] Diagnostics server failed on port ' + PORT, error);
    });

    server.listen(PORT, '127.0.0.1', () => {
        console.log('[CosDI] Diagnostics window listening on http://127.0.0.1:' + PORT + '/diagnostics');
    });
}

function stopServer() {
    if (!server) {
        return;
    }
    server.close();
    server = null;
}

exports.methods = {
    openPanel() {
        Editor.Panel.open(PANEL);
    },
    getSnapshot() {
        return snapshot;
    },
};

exports.load = function () {
    startServer();
    console.log('[CosDI] Diagnostics extension loaded');
};

exports.unload = function () {
    stopServer();
    try {
        Editor.Panel.close(PANEL);
    } catch (_error) {}
};
