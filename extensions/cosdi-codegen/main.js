'use strict';

const fs = require('fs');
const path = require('path');
const { loadConfig, generateTokens } = require('./lib/token-codegen.js');

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
    if (result.changed.length) {
        console.log('[CosDI] Wrote interface tokens in ' + result.changed.length + ' file(s)');
        reimport(result.changed);
    } else if (!quiet) {
        console.log('[CosDI] Interface tokens are up to date (' + result.tokens + ' token' + (result.tokens === 1 ? '' : 's') + ')');
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
function regenerateForSave(file) {
    const config = loadConfig(Editor.Project.path);
    if (config.mode === 'inline') {
        generateProjectTokens(true, [file]);
        return;
    }
    let tagged = false;
    try {
        tagged = fs.readFileSync(file, 'utf8').indexOf('@createToken') >= 0;
    } catch (_error) {
        tagged = false;
    }
    if (tagged || tokenSources.indexOf(file) >= 0) {
        generateProjectTokens(true);
    }
}

function scheduleTokenGeneration(info) {
    const file = info && (info.file || info.path || '');
    if (typeof file !== 'string' || !file.endsWith('.ts')) {
        return;
    }
    const config = loadConfig(Editor.Project.path);
    if (!config.generateOnSave || !isInsideRoots(file, config)) {
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
        regenerateForSave(file);
    }, TOKEN_DEBOUNCE_MS);
}

exports.methods = {
    generateTokens() {
        return generateProjectTokens(false);
    },
    onAssetChange(_uuid, info) {
        scheduleTokenGeneration(info);
    },
    onAssetDbReady() {
        generateProjectTokens(true);
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
