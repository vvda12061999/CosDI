'use strict';

/**
 * Runs the same reading of the project the CLI does, before Creator builds it.
 * A key nothing registers fails the build here, rather than the first scene
 * that tries to resolve it on a device.
 */

const path = require('path');
const { loadConfig } = require('./lib/token-codegen.js');
const { analyzeProject, formatProblem } = require('./lib/di-analyzer.js');

// Without this, a hook that throws is logged and the build carries on.
exports.throwError = true;

function projectRoot() {
    try {
        if (typeof Editor !== 'undefined' && Editor.Project && Editor.Project.path) {
            return Editor.Project.path;
        }
    } catch (_error) {
        // Outside the editor, the extension's own place says where it is.
    }
    return path.resolve(__dirname, '..', '..');
}

exports.onBeforeBuild = function onBeforeBuild() {
    const root = projectRoot();
    const config = loadConfig(root);
    if (!config.validate.enabled || config.validate.onBuild === 'off') {
        return;
    }

    let result;
    try {
        result = analyzeProject(config);
    } catch (error) {
        // A build is the wrong place to fail over a reading of the sources.
        console.warn('[CosDI] Validation could not run: ' + ((error && error.message) || error));
        return;
    }

    for (const problem of result.problems) {
        const line = '[CosDI] ' + formatProblem(problem, root);
        if (problem.severity === 'error' && config.validate.onBuild === 'error') {
            console.error(line);
        } else {
            console.warn(line);
        }
    }

    if (result.errors > 0 && config.validate.onBuild === 'error') {
        throw new Error('[CosDI] ' + result.errors + ' dependency injection problem'
            + (result.errors === 1 ? '' : 's') + ' in the project. Fix them, or set '
            + '"validate": { "onBuild": "warn" } in cosdi.codegen.json to build anyway.');
    }
    if (!result.problems.length) {
        console.log('[CosDI] ' + result.registrations + ' registration(s) check out');
    }
};
