'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig, generateTokens } = require('./lib/token-codegen.js');
const { analyzeProject, formatProblem } = require('./lib/di-analyzer.js');

const TOKEN_DEBOUNCE_MS = 400;

let tokenTimer = null;
let tokenSources = [];

function projectAssetsDir() {
    return path.join(Editor.Project.path, 'assets');
}

/** Writes the token for every tagged interface the config points at. */
function generateProjectTokens(quiet, files) {
    let result;
    const config = loadConfig(Editor.Project.path);
    if (config.error) {
        console.warn('[CosDI] ' + config.error);
    }
    try {
        result = generateTokens(Object.assign({}, config, files ? { files } : {}));
    } catch (error) {
        console.error('[CosDI] Interface token generation failed', error);
        return null;
    }
    for (const warning of result.warnings) {
        console.warn('[CosDI] ' + warning);
    }
    if (!files) {
        tokenSources = result.sources;
    }
    const noun = config.mode === 'keys' ? 'service key' : 'interface token';
    if (result.changed.length) {
        console.log('[CosDI] Wrote ' + noun + 's in ' + result.changed.length + ' file(s)');
        reimport(result.changed);
    } else if (!quiet) {
        console.log('[CosDI] ' + result.tokens + ' ' + noun + (result.tokens === 1 ? '' : 's') + ' up to date');
    }
    return result;
}

/**
 * Reads the registrations and injection sites in the project. The container
 * checks the same things when it is built, which is only as far as play gets;
 * this says so while the file that broke it is still on screen.
 */
function validateProject(quiet) {
    const config = loadConfig(Editor.Project.path);
    if (!config.validate.enabled) {
        return null;
    }

    let result;
    try {
        result = analyzeProject(config);
    } catch (error) {
        console.error('[CosDI] Validation failed', error);
        return null;
    }

    for (const problem of result.problems) {
        const line = '[CosDI] ' + formatProblem(problem, Editor.Project.path);
        if (problem.severity === 'error') {
            console.error(line);
        } else {
            console.warn(line);
        }
    }
    if (!result.problems.length && !quiet) {
        console.log('[CosDI] ' + result.registrations + ' registration(s) check out');
    }
    return result;
}

/** Reimports the files just written so the editor compiles the new tokens. */
function reimport(files) {
    const assets = projectAssetsDir();
    for (const file of files) {
        const relative = path.relative(assets, file).split(path.sep).join('/');
        if (!relative || relative.startsWith('..')) {
            continue;
        }
        const url = 'db://assets/' + relative;
        Promise.resolve()
            .then(() => Editor.Message.request('asset-db', 'refresh-asset', url))
            .catch(() => undefined);
    }
}

function isInsideRoots(file, config) {
    for (const root of config.roots) {
        const relative = path.relative(root, file);
        if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
            return true;
        }
    }
    return false;
}

/**
 * A save only revisits the file that was saved. When tokens are collected into
 * one module, a saved file can add or drop an entry, so the module is rebuilt,
 * but only when that file carries a tag now or contributed one last time.
 */
function regenerateForSave(file, config) {
    if (config.mode === 'inline') {
        generateProjectTokens(true, [file]);
        return;
    }
    let contributes = false;
    try {
        const source = fs.readFileSync(file, 'utf8');
        contributes = /@(?:generateToken|createToken)\b/.test(source)
            || (config.include === 'exported' && /\bexport\s+interface\b/.test(source));
    } catch (_error) {
        contributes = false;
    }
    if (contributes || tokenSources.indexOf(file) >= 0) {
        generateProjectTokens(true);
    }
}

/**
 * A saved file is read for tokens on its own, but validation reads the whole
 * project: a registration removed here is what breaks an inject over there.
 */
function handleSave(file) {
    const config = loadConfig(Editor.Project.path);
    if (config.generateOnSave) {
        regenerateForSave(file, config);
    }
    if (config.validate.enabled && config.validate.validateOnSave) {
        validateProject(true);
    }
}

function scheduleTokenGeneration(info) {
    const file = info && (info.file || info.path || '');
    if (typeof file !== 'string' || !file.endsWith('.ts')) {
        return;
    }
    const config = loadConfig(Editor.Project.path);
    const wanted = config.generateOnSave || (config.validate.enabled && config.validate.validateOnSave);
    if (!wanted || !isInsideRoots(file, config)) {
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
        handleSave(file);
    }, TOKEN_DEBOUNCE_MS);
}

exports.methods = {
    generateTokens() {
        return generateProjectTokens(false);
    },
    validateProject() {
        return validateProject(false);
    },
    onAssetChange(_uuid, info) {
        scheduleTokenGeneration(info);
    },
    onAssetDbReady() {
        generateProjectTokens(true);
        validateProject(true);
    },
};

exports.load = function () {
    generateProjectTokens(true);
    console.log('[CosDI] Interface token generator loaded');
};

exports.unload = function () {
    if (tokenTimer) {
        clearTimeout(tokenTimer);
        tokenTimer = null;
    }
};
