#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const EXTENSION_NAME = 'cosdi-diagnostics';
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SKIP_NAMES = new Set(['node_modules', '.git', '.installed-version']);

function log(message) {
    console.log('[CosDI Diagnostics] ' + message);
}

function warn(message) {
    console.warn('[CosDI Diagnostics] ' + message);
}

function usage() {
    console.log('Usage: npx cosdi-diagnostics <install|uninstall|status> [--project <path>]');
    console.log('Run it from your Cocos Creator project root, or pass --project.');
}

function parseArgs(argv) {
    const options = { command: 'install', project: '', fromPostinstall: false, force: false };
    const rest = [];
    for (let index = 0; index < argv.length; index += 1) {
        const arg = argv[index];
        if (arg === '--project' || arg === '-p') {
            options.project = argv[index + 1] || '';
            index += 1;
        } else if (arg.startsWith('--project=')) {
            options.project = arg.slice('--project='.length);
        } else if (arg === '--from-postinstall') {
            options.fromPostinstall = true;
        } else if (arg === '--force' || arg === '-f') {
            options.force = true;
        } else {
            rest.push(arg);
        }
    }
    if (rest.length > 0) {
        options.command = rest[0];
    }
    return options;
}

function isCreatorProject(dir) {
    if (!dir || !fs.existsSync(path.join(dir, 'assets'))) {
        return false;
    }
    if (fs.existsSync(path.join(dir, 'settings'))) {
        return true;
    }
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
        return !!(pkg && pkg.creator);
    } catch (_error) {
        return false;
    }
}

function findProjectRoot(start) {
    let dir = path.resolve(start);
    for (let depth = 0; depth < 24; depth += 1) {
        if (path.basename(dir) === 'node_modules') {
            dir = path.dirname(dir);
            continue;
        }
        if (isCreatorProject(dir)) {
            return dir;
        }
        const parent = path.dirname(dir);
        if (parent === dir) {
            return '';
        }
        dir = parent;
    }
    return '';
}

function resolveProjectRoot(options) {
    // Asking for a project by name and being given the one you happen to be
    // standing in is worse than being told nothing is there.
    if (options.project) {
        return findProjectRoot(options.project);
    }

    const candidates = [
        process.env.COSDI_PROJECT,
        // Ahead of INIT_CWD, which npm sets to wherever npm was run from: a
        // command run inside a project means that project, not that one.
        process.cwd(),
        process.env.INIT_CWD,
    ];
    for (const candidate of candidates) {
        if (!candidate) {
            continue;
        }
        const root = findProjectRoot(candidate);
        if (root) {
            return root;
        }
    }
    return '';
}

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (SKIP_NAMES.has(entry.name)) {
            continue;
        }
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

function readVersion() {
    try {
        const pkg = JSON.parse(fs.readFileSync(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'));
        return String(pkg.version || '0.0.0');
    } catch (_error) {
        return '0.0.0';
    }
}

function extensionDir(projectRoot) {
    return path.join(projectRoot, 'extensions', EXTENSION_NAME);
}

function install(options) {
    const projectRoot = resolveProjectRoot(options);
    if (!projectRoot) {
        const hint = 'Could not find a Cocos Creator project. Run this from the project root or pass --project <path>.';
        if (options.fromPostinstall) {
            warn(hint);
            return true;
        }
        warn(hint);
        return false;
    }

    const dest = extensionDir(projectRoot);
    if (path.resolve(dest) === PACKAGE_ROOT) {
        // Already living in the project's extensions folder (repo checkout or re-run).
        log('Already installed at ' + dest);
        return true;
    }

    if (!options.force && fs.existsSync(dest) && !fs.existsSync(path.join(dest, '.installed-version'))) {
        // A folder we did not create: most likely a hand-maintained or checked-out copy.
        warn(dest + ' already exists and was not installed by this package. Re-run with --force to replace it.');
        return options.fromPostinstall;
    }

    fs.rmSync(dest, { recursive: true, force: true });
    copyDir(PACKAGE_ROOT, dest);
    fs.writeFileSync(path.join(dest, '.installed-version'), readVersion() + '\n', 'utf8');
    log('Installed v' + readVersion() + ' to ' + path.relative(projectRoot, dest));
    log('Restart Cocos Creator, then open Panel \u2192 CosDI Diagnostics.');
    return true;
}

function uninstall(options) {
    const projectRoot = resolveProjectRoot(options);
    if (!projectRoot) {
        warn('Could not find a Cocos Creator project. Pass --project <path>.');
        return false;
    }
    const dest = extensionDir(projectRoot);
    if (path.resolve(dest) === PACKAGE_ROOT) {
        warn('Refusing to delete the package it is running from: ' + dest);
        return false;
    }
    if (!fs.existsSync(dest)) {
        log('Nothing to remove at ' + path.relative(projectRoot, dest));
        return true;
    }
    fs.rmSync(dest, { recursive: true, force: true });
    log('Removed ' + path.relative(projectRoot, dest));
    return true;
}

function status(options) {
    const projectRoot = resolveProjectRoot(options);
    if (!projectRoot) {
        warn('Could not find a Cocos Creator project. Pass --project <path>.');
        return false;
    }
    const dest = extensionDir(projectRoot);
    log('Project: ' + projectRoot);
    if (!fs.existsSync(path.join(dest, 'package.json'))) {
        log('Extension: not installed');
        return true;
    }
    let installed = 'unknown';
    try {
        installed = fs.readFileSync(path.join(dest, '.installed-version'), 'utf8').trim() || 'unknown';
    } catch (_error) {}
    log('Extension: installed (v' + installed + '), package v' + readVersion());
    return true;
}

function main() {
    const options = parseArgs(process.argv.slice(2));

    if (options.fromPostinstall && process.env.COSDI_DIAGNOSTICS_SKIP_INSTALL === '1') {
        return 0;
    }

    let ok = false;
    switch (options.command) {
        case 'install':
            ok = install(options);
            break;
        case 'uninstall':
        case 'remove':
            ok = uninstall(options);
            break;
        case 'status':
            ok = status(options);
            break;
        case 'help':
        case '--help':
        case '-h':
            usage();
            return 0;
        default:
            usage();
            return 1;
    }
    return ok ? 0 : 1;
}

try {
    const code = main();
    // A failed postinstall must never break `npm install` for the whole project.
    process.exit(process.env.npm_lifecycle_event === 'postinstall' ? 0 : code);
} catch (error) {
    warn(String((error && error.message) || error));
    process.exit(process.env.npm_lifecycle_event === 'postinstall' ? 0 : 1);
}
