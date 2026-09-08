#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const extension = path.join(root, 'extensions', 'cosdi-codegen');
const cli = path.join(extension, 'bin', 'cosdi-codegen.js');
const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-validate-'));

const SCOPE = `
import { LifetimeScope, IContainerBuilder, Lifetime } from 'cosdi';
import { PlayerService } from './PlayerService';
import { IPlayerService } from './Services';

export class GameLifetimeScope extends LifetimeScope {
    protected configure(builder: IContainerBuilder): void {
        builder.register(PlayerService, Lifetime.Singleton).as(IPlayerService);
    }
}
`;

const HUD_OK = `
import { inject } from 'cosdi';
import { IPlayerService } from './Services';

export class Hud {
    @inject(IPlayerService)
    private playerService: IPlayerService;
}
`;

const HUD_BROKEN = HUD_OK.replace(/IPlayerService/g, 'IPlayerServcie');

function write(file, text) {
    const full = path.join(project, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text, 'utf8');
}

function run(...args) {
    return spawnSync(process.execPath, [cli, ...args], { cwd: project, encoding: 'utf8' });
}

/** Loads the build hook with the globals Creator would have given it. */
function build(configPatch) {
    if (configPatch) {
        write('cosdi.codegen.json', JSON.stringify(configPatch, null, 2) + '\n');
    }
    delete require.cache[require.resolve(path.join(extension, 'build-hooks.js'))];
    delete require.cache[require.resolve(path.join(extension, 'lib', 'token-codegen.js'))];
    delete require.cache[require.resolve(path.join(extension, 'lib', 'di-analyzer.js'))];

    const hooks = require(path.join(extension, 'build-hooks.js'));
    const logged = [];
    const console_ = { log: console.log, warn: console.warn, error: console.error };
    const capture = (line) => logged.push(String(line));
    console.log = capture;
    console.warn = capture;
    console.error = capture;

    global.Editor = { Project: { path: project } };
    let thrown = null;
    try {
        hooks.onBeforeBuild({ platform: 'web-mobile' });
    } catch (error) {
        thrown = error;
    } finally {
        console.log = console_.log;
        console.warn = console_.warn;
        console.error = console_.error;
        delete global.Editor;
    }
    return { thrown, output: logged.join('\n') };
}

try {
    write('package.json', JSON.stringify({ name: 'scratch', creator: { version: '3.8.8' } }, null, 2));
    fs.mkdirSync(path.join(project, 'settings'), { recursive: true });
    write('cosdi.codegen.json', JSON.stringify({ roots: ['assets/Scripts'] }, null, 2) + '\n');
    write('assets/Scripts/IPlayerService.ts', '/** @generateToken */\nexport interface IPlayerService {\n    attack(): void;\n}\n');
    write('assets/Scripts/Services.ts', "export * from 'cosdi-tokens';\n");
    write('assets/Scripts/PlayerService.ts', "import { injectable } from 'cosdi';\n\n@injectable()\nexport class PlayerService {}\n");
    write('assets/Scripts/GameLifetimeScope.ts', SCOPE);
    write('assets/Scripts/Hud.ts', HUD_OK);

    const clean = run('validate');
    assert.strictEqual(clean.status, 0, clean.stdout + clean.stderr);
    assert.match(clean.stdout, /1 registration\(s\), 0 error\(s\)/);

    // The same project with one letter out of place in the key.
    write('assets/Scripts/Hud.ts', HUD_BROKEN);
    const broken = run('validate');
    assert.strictEqual(broken.status, 1, 'a missing registration must fail the command');
    assert.match(broken.stderr, /Hud\.ts:6:5 {2}error {2}Hud asks for IPlayerServcie/);
    assert.match(broken.stderr, /\[missing-registration\]/);

    // The build hook reads the same config and stops the build.
    const failed = build();
    assert.ok(failed.thrown, 'the build hook must throw when the project is broken');
    assert.match(String(failed.thrown.message), /1 dependency injection problem in the project/);
    assert.match(failed.output, /Hud asks for IPlayerServcie/);

    const warned = build({ roots: ['assets/Scripts'], validate: { onBuild: 'warn' } });
    assert.strictEqual(warned.thrown, null, 'onBuild: warn must let the build through');
    assert.match(warned.output, /Hud asks for IPlayerServcie/);

    const off = build({ roots: ['assets/Scripts'], validate: { onBuild: 'off' } });
    assert.strictEqual(off.thrown, null);
    assert.strictEqual(off.output, '', 'onBuild: off must say nothing');

    const disabled = build({ roots: ['assets/Scripts'], validate: { enabled: false } });
    assert.strictEqual(disabled.thrown, null);
    assert.strictEqual(disabled.output, '');
    assert.match(run('validate').stdout, /Validation is off/);
    assert.strictEqual(run('validate').status, 0);

    // An ignored key is a project's way of saying something else registers it.
    write('cosdi.codegen.json', JSON.stringify({
        roots: ['assets/Scripts'],
        validate: { ignore: ['IPlayerServcie'] },
    }, null, 2) + '\n');
    assert.strictEqual(run('validate').status, 0, 'ignore did not take');

    write('assets/Scripts/Hud.ts', HUD_OK);
    write('cosdi.codegen.json', JSON.stringify({ roots: ['assets/Scripts'] }, null, 2) + '\n');
    const fixed = build();
    assert.strictEqual(fixed.thrown, null);
    assert.match(fixed.output, /1 registration\(s\) check out/);

    assert.match(run('status').stdout, /Validation: on, error on build/);

    console.log('cosdi-codegen validate CLI and build hook OK');
} finally {
    fs.rmSync(project, { recursive: true, force: true });
}
