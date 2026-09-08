'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { generateTokens } = require('./lib/token-codegen.js');

const PORT = 38477;
const RUNTIME_DIR = path.join(__dirname, 'runtime');
const FOLDER_META = path.join(__dirname, 'static', 'CosDI.folder.meta');
const TOKEN_DEBOUNCE_MS = 400;

let snapshot = { scopes: [], collectedAt: 0, empty: true };
let server = null;
let lastLogKey = '';
let tokenTimer = null;

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

function copyDir(src, dest, skip) {
    skip = skip || {};
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        if (skip[entry.name] || (skip.meta && entry.name.endsWith('.meta'))) {
            continue;
        }
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to, skip);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

function projectAssetsDir() {
    return path.join(Editor.Project.path, 'assets');
}

function installRuntime(force) {
    if (!fs.existsSync(RUNTIME_DIR)) {
        console.warn('[CosDI] Extension runtime folder is missing.');
        return false;
    }
    const assetsDir = projectAssetsDir();
    const dest = path.join(assetsDir, 'CosDI');
    const version = readExtensionVersion();
    const marker = path.join(dest, '.installed-version');
    const alreadyInstalled = fs.existsSync(marker)
        && fs.existsSync(path.join(dest, 'Runtime', 'index.ts'))
        && fs.readFileSync(marker, 'utf8').trim() === version;
    if (!force && alreadyInstalled) {
        installNpmPackage();
        return true;
    }
    copyDir(RUNTIME_DIR, dest);
    if (fs.existsSync(FOLDER_META)) {
        fs.copyFileSync(FOLDER_META, path.join(assetsDir, 'CosDI.meta'));
    }
    fs.writeFileSync(marker, version, 'utf8');
    console.log('[CosDI] Runtime installed to assets/CosDI (v' + version + ')');
    installNpmPackage();
    refreshAssets();
    return true;
}

function installNpmPackage() {
    const projectPath = Editor.Project.path;
    const src = path.join(projectAssetsDir(), 'CosDI');
    const dest = path.join(projectPath, 'node_modules', 'cosdi');
    if (!fs.existsSync(path.join(src, 'Runtime', 'index.ts'))) {
        console.warn('[CosDI] Runtime is missing; cannot install npm package');
        return;
    }
    copyDir(src, dest, { '.installed-version': true, meta: true });
    const pkgPath = path.join(dest, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        fs.writeFileSync(pkgPath, JSON.stringify({
            name: 'cosdi',
            version: readExtensionVersion(),
            main: './Runtime/index.ts',
            module: './Runtime/index.ts',
            types: './Runtime/index.ts',
            exports: { '.': './Runtime/index.ts' },
        }, null, 2) + '\n', 'utf8');
    }
    console.log('[CosDI] Creator ' + readEditorVersion() + ': package ready at node_modules/cosdi');
}

function readEditorVersion() {
    try {
        if (Editor.App && Editor.App.version) {
            return String(Editor.App.version);
        }
    } catch (_error) {}
    try {
        if (Editor.versions && Editor.versions.editor) {
            return String(Editor.versions.editor);
        }
    } catch (_error) {}
    return '3.8.0';
}

function readExtensionVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
        return String(pkg.version || '1.0.0');
    } catch (_error) {
        return '1.0.0';
    }
}

/** Writes the token for every `@createToken` interface under assets/. */
function generateProjectTokens(quiet) {
    let result;
    try {
        result = generateTokens({ roots: [projectAssetsDir()] });
    } catch (error) {
        console.error('[CosDI] Interface token generation failed', error);
        return null;
    }
    for (const warning of result.warnings) {
        console.warn('[CosDI] ' + warning);
    }
    if (result.changed.length) {
        console.log('[CosDI] Wrote interface tokens in ' + result.changed.length + ' file(s)');
    } else if (!quiet) {
        console.log('[CosDI] Interface tokens are up to date (' + result.tokens + ' token' + (result.tokens === 1 ? '' : 's') + ')');
    }
    return result;
}

function scheduleTokenGeneration(info) {
    const file = info && (info.file || info.path || '');
    if (typeof file !== 'string' || !file.endsWith('.ts')) {
        return;
    }
    if (file.indexOf(path.join('assets', 'CosDI')) >= 0) {
        return;
    }
    if (tokenTimer) {
        clearTimeout(tokenTimer);
    }
    tokenTimer = setTimeout(() => {
        tokenTimer = null;
        generateProjectTokens(true);
    }, TOKEN_DEBOUNCE_MS);
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
        return installRuntime(true);
    },
    generateTokens() {
        return generateProjectTokens(false);
    },
    onAssetChange(_uuid, info) {
        scheduleTokenGeneration(info);
    },
};

exports.load = function () {
    installRuntime(false);
    generateProjectTokens(true);
    startServer();
    console.log('[CosDI] editor extension loaded');
};

exports.unload = function () {
    if (tokenTimer) {
        clearTimeout(tokenTimer);
        tokenTimer = null;
    }
    stopServer();
    try {
        Editor.Panel.close('cosdi');
    } catch (_error) {}
};
