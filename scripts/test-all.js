#!/usr/bin/env node
'use strict';

/**
 * Runs every suite in one go, which is what `npm test` and each leg of the CI
 * matrix do. Suites are separate processes, so one crashing says which one it
 * was and the rest still run.
 *
 * `--filter <text>` runs the suites whose name contains it, `--list` names
 * them without running anything.
 */

const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const codegenCli = path.join(root, 'extensions', 'cosdi-codegen', 'bin', 'cosdi-codegen.js');

const SUITES = [
    { name: 'versions', args: [path.join(__dirname, 'check-versions.js')] },
    { name: 'runtime', args: [path.join(__dirname, 'test-runtime.js')] },
    { name: 'validation', args: [path.join(__dirname, 'test-validation.js')] },
    { name: 'circular', args: [path.join(__dirname, 'test-circular.js')] },
    { name: 'graph', args: [path.join(__dirname, 'test-graph.js')] },
    { name: 'errors', args: [path.join(__dirname, 'test-errors.js')] },
    { name: 'token-codegen', args: [path.join(__dirname, 'test-token-codegen.js')] },
    { name: 'codegen-modes', args: [path.join(__dirname, 'test-codegen-modes.js')] },
    { name: 'di-analyzer', args: [path.join(__dirname, 'test-di-analyzer.js')] },
    { name: 'validate-cli', args: [path.join(__dirname, 'test-validate-cli.js')] },
    { name: 'diagnostics-install', args: [path.join(__dirname, 'test-diagnostics-install.js')] },
    { name: 'codegen-install', args: [path.join(__dirname, 'test-codegen-install.js')] },
    { name: 'own-di', args: [codegenCli, 'validate', '--project', root, '--strict'] },
];

const filter = valueOf('--filter');
const suites = filter ? SUITES.filter((suite) => suite.name.indexOf(filter) >= 0) : SUITES;

if (process.argv.indexOf('--list') >= 0) {
    for (const suite of suites) {
        console.log(suite.name);
    }
    process.exit(0);
}

if (suites.length === 0) {
    console.error('No suite matches ' + filter + '. Try --list.');
    process.exit(2);
}

console.log(`node ${process.version} on ${process.platform}-${process.arch}, typescript ${typescriptVersion()}`);
console.log('');

const results = [];
for (const suite of suites) {
    const started = Date.now();
    const run = spawnSync(process.execPath, suite.args, { stdio: 'inherit' });
    results.push({
        name: suite.name,
        ok: run.status === 0,
        // A suite killed by a signal has no status, which is a failure too.
        detail: run.status === 0 ? '' : (run.signal || 'exit ' + run.status),
        ms: Date.now() - started,
    });
}

console.log('');
const width = Math.max(...results.map((result) => result.name.length));
for (const result of results) {
    const seconds = (result.ms / 1000).toFixed(1) + 's';
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name.padEnd(width)}  ${seconds.padStart(6)}${result.detail ? '  ' + result.detail : ''}`);
}

const failed = results.filter((result) => !result.ok);
const total = (results.reduce((sum, result) => sum + result.ms, 0) / 1000).toFixed(1);
if (failed.length > 0) {
    console.error(`\n${failed.length} of ${results.length} suites failed in ${total}s: ${failed.map((result) => result.name).join(', ')}`);
    process.exit(1);
}
console.log(`\n${results.length} suites passed in ${total}s`);

function valueOf(flag) {
    const at = process.argv.indexOf(flag);
    return at >= 0 ? process.argv[at + 1] : '';
}

function typescriptVersion() {
    try {
        return require(path.join(root, 'node_modules', 'typescript', 'package.json')).version;
    } catch (_error) {
        return 'missing';
    }
}
