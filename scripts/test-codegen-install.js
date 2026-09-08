#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'extensions', 'cosdi-codegen', 'bin', 'cosdi-codegen.js');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-project-'));

function run(...args) {
    return execFileSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8' });
}

try {
    // A minimal Cocos Creator project layout with one tagged interface.
    fs.mkdirSync(path.join(project, 'assets', 'Scripts'), { recursive: true });
    fs.mkdirSync(path.join(project, 'settings'), { recursive: true });
    fs.writeFileSync(
        path.join(project, 'package.json'),
        JSON.stringify({ name: 'scratch', creator: { version: '3.8.8' } }, null, 2),
    );
    fs.writeFileSync(
        path.join(project, 'assets', 'Scripts', 'IPlayerService.ts'),
        '/** @generateToken */\nexport interface IPlayerService {\n    attack(): void;\n}\n',
    );

    const installed = path.join(project, 'extensions', 'cosdi-codegen');
    run('install');
    assert.ok(fs.existsSync(path.join(installed, 'package.json')), 'package.json was not installed');
    assert.ok(fs.existsSync(path.join(installed, 'main.js')), 'main.js was not installed');
    assert.ok(fs.existsSync(path.join(installed, 'lib', 'token-codegen.js')), 'generator was not installed');
    assert.ok(fs.existsSync(path.join(installed, '.installed-version')), 'version marker is missing');

    // Installing configures the project: the tokens exist without another step.
    const generated = path.join(project, 'node_modules', 'cosdi-tokens', 'index.ts');
    assert.ok(fs.existsSync(generated), 'install did not generate the tokens');
    assert.match(fs.readFileSync(generated, 'utf8'), /export const IPlayerService = createToken/);
    assert.strictEqual(
        fs.readFileSync(path.join(project, 'assets', 'Scripts', 'IPlayerService.ts'), 'utf8').indexOf('createToken'),
        -1,
        'the interface file must stay untouched',
    );

    assert.match(run('generate', '--check'), /0 stale|1 token/);
    assert.match(run('status'), /Extension: installed/);

    // Re-installing an already managed folder must succeed (upgrade path).
    run('install');

    run('uninstall');
    assert.ok(!fs.existsSync(installed), 'uninstall left the extension behind');

    // Detection has to work from a nested directory too.
    execFileSync(process.execPath, [cli, 'install'], {
        cwd: path.join(project, 'assets', 'Scripts'),
        encoding: 'utf8',
    });
    assert.ok(fs.existsSync(path.join(installed, 'package.json')), 'install from a nested cwd failed');

    console.log('cosdi-codegen install/generate/uninstall OK');
} finally {
    fs.rmSync(project, { recursive: true, force: true });
}
