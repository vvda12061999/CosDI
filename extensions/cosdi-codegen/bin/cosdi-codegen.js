#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig, generateTokens } = require('../lib/token-codegen.js');

const EXTENSION_NAME = 'cosdi-codegen';
const PACKAGE_ROOT = path.resolve(__dirname, '..');
const SKIP_NAMES = new Set(['node_modules', '.git', '.installed-version']);

function log(message) {
    console.log('[CosDI Codegen] ' + message);
}

function warn(message) {
    console.warn('[CosDI Codegen] ' + message);
}

function usage() {
    console.log('Usage: npx cosdi-codegen <install|uninstall|status|generate> [--project <path>] [--check]');
    console.log('Run it from your Cocos Creator project root, or pass --project.');
}

function parseArgs(argv) {
    const options = { command: 'install', project: '', fromPostinstall: false, force: false, check: false };
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
        } else if (arg === '--check') {
            options.check = true;
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
    const candidates = [
        options.project,
        process.env.COSDI_PROJECT,
        process.env.INIT_CWD,
        process.cwd(),
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

/** Writes the tokens for a project, so an install leaves it ready to compile. */
function generate(projectRoot, check) {
    const config = loadConfig(projectRoot);
    if (config.error) {
        warn(config.error);
    }
    const result = generateTokens(Object.assign({}, config, { check }));
    for (const warning of result.warnings) {
        warn(warning);
    }
    for (const file of result.changed) {
        log((check ? 'stale ' : 'wrote ') + path.relative(projectRoot, file));
    }
    const unit = config.mode === 'keys' ? 'service key' : 'token';
    log(result.tokens + ' ' + unit + (result.tokens === 1 ? '' : 's') + ' from ' + result.scanned + ' file(s)');
    return !(check && result.changed.length);
}

function install(options) {
    const projectRoot = resolveProjectRoot(options);
    if (!projectRoot) {
        const hint = 'Could not find a Cocos Creator project. Run this from the project root or pass --project <path>.';
        warn(hint);
        return options.fromPostinstall;
    }

    const dest = extensionDir(projectRoot);
    if (path.resolve(dest) === PACKAGE_ROOT) {
        // Already living in the project's extensions folder (repo checkout or re-run).
        log('Already installed at ' + dest);
        return generate(projectRoot, false);
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

    // Generating now means a project compiles straight after install, without
    // waiting for the editor to load the extension.
    generate(projectRoot, false);
    log('Restart Cocos Creator to pick up the extension.');
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
    const config = loadConfig(projectRoot);
    log('Project: ' + projectRoot);
    log('Mode: ' + config.mode + ', output: ' + path.relative(projectRoot, config.out));
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

    if (options.fromPostinstall && process.env.COSDI_CODEGEN_SKIP_INSTALL === '1') {
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
        case 'generate':
        case 'tokens': {
            const projectRoot = resolveProjectRoot(options) || process.cwd();
            ok = generate(projectRoot, options.check);
            if (!ok) {
                warn('Tokens are out of date. Run: npx cosdi-codegen generate');
            }
            break;
        }
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
