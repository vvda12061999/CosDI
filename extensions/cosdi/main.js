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
        installImportAlias();
        return true;
    }
    copyDir(RUNTIME_DIR, dest);
    if (fs.existsSync(FOLDER_META)) {
        fs.copyFileSync(FOLDER_META, path.join(assetsDir, 'CosDI.meta'));
    }
    fs.writeFileSync(marker, version, 'utf8');
    console.log('[CosDI] Runtime installed to assets/CosDI (v' + version + ')');
    installImportAlias();
    refreshAssets();
    return true;
}

function installImportAlias() {
    const projectPath = Editor.Project.path;
    const mapPath = path.join(projectPath, 'import-map.json');
    let map = { imports: {} };
    try {
        if (fs.existsSync(mapPath)) {
            map = JSON.parse(fs.readFileSync(mapPath, 'utf8')) || map;
        }
    } catch (_error) {}
    map.imports = map.imports || {};
    map.imports.cosdi = './assets/CosDI/Runtime/index.ts';
    fs.writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n');

    const settingsPath = path.join(projectPath, 'settings', 'v2', 'packages', 'project.json');
    try {
        let settings = { __version__: '1.0.6', script: {} };
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) || settings;
        } else {
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        }
        settings.script = settings.script || {};
        settings.script.importMap = 'project://import-map.json';
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    } catch (error) {
        console.warn('[CosDI] Could not write project import map setting', error);
    }

    try {
        if (Editor.Profile && typeof Editor.Profile.setProject === 'function') {
            Promise.resolve(Editor.Profile.setProject('project', 'script.importMap', 'project://import-map.json'))
                .catch((error) => console.warn('[CosDI] Could not set project import map', error));
        }
    } catch (error) {
        console.warn('[CosDI] Could not set project import map', error);
    }

    const tsconfigPath = path.join(projectPath, 'tsconfig.json');
    try {
        let tsconfig = { compilerOptions: { paths: {} } };
        if (fs.existsSync(tsconfigPath)) {
            tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8')) || tsconfig;
        }
        tsconfig.compilerOptions = tsconfig.compilerOptions || {};
        tsconfig.compilerOptions.baseUrl = tsconfig.compilerOptions.baseUrl || '.';
        tsconfig.compilerOptions.paths = tsconfig.compilerOptions.paths || {};
        tsconfig.compilerOptions.paths.cosdi = ['./assets/CosDI/Runtime/index.ts'];
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
    } catch (error) {
        console.warn('[CosDI] Could not write tsconfig paths for cosdi', error);
    }

    console.log('[CosDI] import { ... } from \'cosdi\' is ready');
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
        return installRuntime(true);
    },
};

exports.load = function () {
    installRuntime(false);
    startServer();
    console.log('[CosDI] editor extension loaded');
};

exports.unload = function () {
    stopServer();
    try {
        Editor.Panel.close('cosdi');
    } catch (_error) {}
};
