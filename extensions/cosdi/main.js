'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');

const PORT = 38477;
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const FOLDER_META = path.join(__dirname, 'static', 'CosDI.folder.meta');

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
                    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
                    if (parsed && typeof parsed === 'object') {
                        snapshot = parsed;
                        snapshot.empty = !snapshot.scopes || snapshot.scopes.length === 0;
                        const key = String(snapshot.collectedAt || 0) + ':' + (snapshot.scopes ? snapshot.scopes.length : 0);
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

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

function projectAssetsDir() {
    return path.join(Editor.Project.path, 'assets');
}

function installRuntime() {
    if (!fs.existsSync(RUNTIME_DIR)) {
        console.warn('[CosDI] Extension runtime folder is missing.');
        return false;
    }
    const assetsDir = projectAssetsDir();
    const dest = path.join(assetsDir, 'CosDI');
    copyDir(RUNTIME_DIR, dest);
    if (fs.existsSync(FOLDER_META)) {
        fs.copyFileSync(FOLDER_META, path.join(assetsDir, 'CosDI.meta'));
    }
    const version = readExtensionVersion();
    fs.writeFileSync(path.join(dest, '.installed-version'), version, 'utf8');
    console.log('[CosDI] Runtime installed to assets/CosDI (v' + version + ')');
    refreshAssets();
    return true;
}

function readExtensionVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        return String(pkg.version || '1.0.0');
    } catch (_error) {
        return '1.0.0';
    }
}

function refreshAssets() {
    Promise.resolve()
        .then(() => Editor.Message.request('asset-db', 'refresh-asset', 'db://assets/CosDI'))
        .catch(() => Editor.Message.request('asset-db', 'refresh'))
        .catch(() => undefined);
}

exports.methods = {
    openPanel() {
        Editor.Panel.open('cosdi');
    },
    getSnapshot() {
        return snapshot;
    },
    installRuntime() {
        return installRuntime();
    },
};

exports.load = function () {
    installRuntime();
    startServer();
    console.log('[CosDI] editor extension loaded');
};

exports.unload = function () {
    stopServer();
};
