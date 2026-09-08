#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'extensions', 'cosdi-diagnostics', 'bin', 'cosdi-diagnostics.js');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-project-'));

function run(...args) {
    return execFileSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8' });
}

try {
    // A minimal Cocos Creator project layout.
    fs.mkdirSync(path.join(project, 'assets'), { recursive: true });
    fs.mkdirSync(path.join(project, 'settings'), { recursive: true });
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ name: 'scratch', creator: { version: '3.8.8' } }, null, 2),
    );

    const installed = path.join(project, 'extensions', 'cosdi-diagnostics');
    run('install');
    assert.ok(fs.existsSync(path.join(installed, 'package.json')), 'package.json was not installed');
    assert.ok(fs.existsSync(path.join(installed, 'main.js')), 'main.js was not installed');
    assert.ok(fs.existsSync(path.join(installed, 'panels', 'default.js')), 'panel was not installed');
    assert.ok(fs.existsSync(path.join(installed, '.installed-version')), 'version marker is missing');

    // Re-installing an already managed folder must succeed (upgrade path).
    run('install');
    assert.match(run('status'), /Extension: installed/);

    run('uninstall');
    assert.ok(!fs.existsSync(installed), 'uninstall left the extension behind');

    // Detection has to work from a nested directory too.
    const nested = path.join(project, 'assets', 'Scripts');
    fs.mkdirSync(nested, { recursive: true });
    execFileSync(process.execPath, [cli, 'install'], { cwd: nested, encoding: 'utf8' });
    assert.ok(fs.existsSync(path.join(installed, 'package.json')), 'install from a nested cwd failed');

    console.log('cosdi-diagnostics install/uninstall OK');
} finally {
    fs.rmSync(project, { recursive: true, force: true });
}
