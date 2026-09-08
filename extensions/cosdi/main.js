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

    writeProjectImportMapSetting(projectPath);

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
        tsconfig.compilerOptions.paths['cosdi/*'] = ['./assets/CosDI/Runtime/*'];
        fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
    } catch (error) {
        console.warn('[CosDI] Could not write tsconfig paths for cosdi', error);
    }

    console.log('[CosDI] Creator ' + readEditorVersion() + ': import { ... } from \'cosdi\' is ready');

    if (versionAtLeast(readEditorVersion(), 3, 3, 0)) {
        removeNodeModuleAlias(projectPath);
    } else {
        installNodeModuleAlias(projectPath);
    }
}

function writeProjectImportMapSetting(projectPath) {
    const version = readEditorVersion();
    const v2Dir = path.join(projectPath, 'settings', 'v2');
    const v2Path = path.join(v2Dir, 'packages', 'project.json');
    const legacyPath = path.join(projectPath, 'settings', 'project.json');
    const writeV2 = versionAtLeast(version, 3, 5, 0) || fs.existsSync(v2Dir);

    if (writeV2) {
        mergeImportMapSetting(v2Path, { __version__: '1.0.6', script: {} });
    }
    if (fs.existsSync(legacyPath)) {
        mergeImportMapSetting(legacyPath, {});
    }
}

function mergeImportMapSetting(settingsPath, fallback) {
    try {
        let settings = fallback;
        if (fs.existsSync(settingsPath)) {
            settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8')) || fallback;
        } else {
            fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        }
        settings.script = settings.script || {};
        settings.script.importMap = 'project://import-map.json';
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
    } catch (error) {
        console.warn('[CosDI] Could not write project import map setting', error);
    }
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

function versionAtLeast(raw, major, minor, patch) {
    const parts = String(raw).split(/[^\d]+/).map((part) => parseInt(part, 10));
    const a = [parts[0] || 0, parts[1] || 0, parts[2] || 0];
    const b = [major, minor, patch];
    for (let i = 0; i < 3; i++) {
        if (a[i] !== b[i]) {
            return a[i] > b[i];
        }
    }
    return true;
}

function installNodeModuleAlias(projectPath) {
    const pkgDir = path.join(projectPath, 'node_modules', 'cosdi');
    const target = path.join(projectPath, 'assets', 'CosDI', 'Runtime', 'index.ts');
    if (!fs.existsSync(target)) {
        return;
    }
    fs.mkdirSync(pkgDir, { recursive: true });
    let rel = path.relative(pkgDir, target).split(path.sep).join('/');
    if (!rel.startsWith('.')) {
        rel = './' + rel;
    }
    const source = "export * from '" + rel + "';\n";
    // Creator 3.0–3.2 has no import maps. Keep main inside this folder and keep the .ts extension.
    fs.writeFileSync(path.join(pkgDir, 'index.js'), source, 'utf8');
    fs.writeFileSync(path.join(pkgDir, 'package.json'), JSON.stringify({
        name: 'cosdi',
        version: readExtensionVersion(),
        type: 'module',
        main: './index.js',
        module: './index.js',
    }, null, 2) + '\n', 'utf8');
    console.log('[CosDI] Creator 3.0–3.2: mapped \'cosdi\' through node_modules/cosdi');
}

function removeNodeModuleAlias(projectPath) {
    const pkgDir = path.join(projectPath, 'node_modules', 'cosdi');
    const indexPath = path.join(pkgDir, 'index.js');
    if (!fs.existsSync(indexPath)) {
        return;
    }
    try {
        const body = fs.readFileSync(indexPath, 'utf8');
        if (body.indexOf('assets/CosDI/Runtime/index') < 0) {
            return;
        }
        fs.unlinkSync(indexPath);
        const pkgPath = path.join(pkgDir, 'package.json');
        if (fs.existsSync(pkgPath)) {
            fs.unlinkSync(pkgPath);
        }
        try {
            fs.rmdirSync(pkgDir);
        } catch (_error) {}
    } catch (error) {
        console.warn('[CosDI] Could not remove leftover node_modules/cosdi', error);
    }
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
