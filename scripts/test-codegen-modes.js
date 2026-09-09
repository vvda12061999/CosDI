#!/usr/bin/env node
'use strict';

/**
 * Every generator mode, end to end: a project is written, the CLI generates
 * into it, and TypeScript reads the result. The generated tokens have to be
 * usable as a value and as a type, so what a mode writes is checked by
 * compiling code that uses it rather than by comparing text.
 *
 * `--mode <name>` runs one mode, which is how CI spreads them over a matrix.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const { copySources } = require('./build-runtime-test.js');

const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'extensions', 'cosdi-codegen', 'bin', 'cosdi-codegen.js');
const stub = path.join(__dirname, 'runtime-test', 'cc-stub.ts');

const MODES = ['inline', 'file', 'package', 'keys'];

const INTERFACE = `/** @generateToken */
export interface IPlayerService {
    attack(): void;
}
`;

const SERVICE = `import { injectable } from 'cosdi';
import { IPlayerService } from './IPlayerService';

@injectable()
export class PlayerService implements IPlayerService {
    attack(): void {}
}
`;

/** Where each mode leaves the token, and how a script gets at it. */
const LAYOUT = {
    inline: {
        artifact: 'assets/Scripts/IPlayerService.ts',
        importsFrom: './IPlayerService',
    },
    file: {
        artifact: 'assets/cosdi-tokens.generated.ts',
        importsFrom: '../cosdi-tokens.generated',
    },
    package: {
        artifact: 'node_modules/cosdi-tokens/index.ts',
        importsFrom: 'cosdi-tokens',
    },
    keys: {
        artifact: 'cosdi-service-keys.d.ts',
        importsFrom: null,
    },
};

let failures = 0;

function check(name, fn) {
    try {
        fn();
        console.log('ok   ' + name);
    } catch (error) {
        failures += 1;
        console.error('FAIL ' + name + ': ' + (error && error.stack ? error.stack.split('\n').slice(0, 6).join('\n') : error));
    }
}

/** The runtime, with its `.ts` specifiers rewritten, shared by every mode. */
let runtimeDir = null;

function runtime() {
    if (!runtimeDir) {
        runtimeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-modes-runtime-'));
        copySources(path.join(root, 'assets', 'CosDI'), path.join(runtimeDir, 'cosdi'));
        fs.copyFileSync(stub, path.join(runtimeDir, 'cc-stub.ts'));
    }
    return runtimeDir;
}

function write(project, file, text) {
    const full = path.join(project, file);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, text, 'utf8');
}

function read(project, file) {
    return fs.readFileSync(path.join(project, file), 'utf8');
}

function exists(project, file) {
    return fs.existsSync(path.join(project, file));
}

/** Writes a project that uses the token the way the mode hands it over. */
function projectFor(mode) {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-mode-' + mode + '-'));
    const layout = LAYOUT[mode];

    write(project, 'package.json', JSON.stringify({ name: 'scratch', creator: { version: '3.8.8' } }, null, 2) + '\n');
    fs.mkdirSync(path.join(project, 'settings'), { recursive: true });
    write(project, 'cosdi.codegen.json', JSON.stringify({ mode, roots: ['assets/Scripts'] }, null, 2) + '\n');
    write(project, 'assets/Scripts/IPlayerService.ts', INTERFACE);
    write(project, 'assets/Scripts/PlayerService.ts', SERVICE);

    const head = `import { ContainerBuilder, Lifetime } from 'cosdi';
import { PlayerService } from './PlayerService';
`;
    const key = layout.importsFrom
        ? `import { IPlayerService } from '${layout.importsFrom}';\n`
        : "import type { IPlayerService } from './IPlayerService';\n";
    const asKey = layout.importsFrom ? 'IPlayerService' : "'IPlayerService'";

    write(project, 'assets/Scripts/Game.ts', head + key + `
const builder = new ContainerBuilder();
builder.register(PlayerService, Lifetime.Singleton).as(${asKey});

const player: IPlayerService = builder.build().resolve(${asKey});
player.attack();
`);

    // The same resolve, read as the wrong type. TypeScript has to object, or
    // the mode is handing back \`any\` and the check above proves nothing.
    write(project, 'assets/Scripts/Probe.ts', head + key + `
const probe: number = new ContainerBuilder().build().resolve(${asKey});
export { probe };
`);

    write(project, 'tsconfig.json', JSON.stringify({
        compilerOptions: {
            target: 'ES2019',
            // No moduleResolution or baseUrl: TypeScript 7 removed both of
            // the values that used to be written here, and `commonjs` alone
            // resolves the same way on every version this is tested against.
            module: 'commonjs',
            strict: false,
            noEmit: true,
            experimentalDecorators: true,
            skipLibCheck: true,
            esModuleInterop: true,
            paths: {
                cosdi: [path.join(runtime(), 'cosdi', 'Runtime', 'index.ts').split(path.sep).join('/')],
                cc: [path.join(runtime(), 'cc-stub.ts').split(path.sep).join('/')],
            },
        },
        include: ['assets/**/*.ts', '*.d.ts', 'node_modules/cosdi-tokens/**/*.ts'],
    }, null, 2) + '\n');

    return project;
}

function generate(project, ...args) {
    return spawnSync(process.execPath, [cli, 'generate', '--project', project, ...args], { encoding: 'utf8' });
}

/** Type errors TypeScript reports in the project's own files, by file name. */
function typecheck(project) {
    const tsc = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    // Run from the project so tsc reports paths relative to it.
    const result = spawnSync(process.execPath, [tsc, '--project', '.', '--pretty', 'false'], {
        cwd: project,
        encoding: 'utf8',
    });
    const reported = new Map();

    for (const line of String(result.stdout || '').split('\n')) {
        const match = /^(.+?)\((\d+),(\d+)\): error TS(\d+): (.*)$/.exec(line.trim());
        if (!match) {
            continue;
        }
        const file = path.resolve(project, match[1]);
        // The runtime and the `cc` stub live elsewhere on purpose: only what
        // the project itself holds says anything about the generated tokens.
        if (!file.startsWith(project + path.sep)) {
            continue;
        }
        const name = path.relative(project, file).split(path.sep).join('/');
        if (!reported.has(name)) {
            reported.set(name, []);
        }
        reported.get(name).push('TS' + match[4] + ': ' + match[5]);
    }
    return reported;
}

for (const mode of chosenModes()) {
    check(mode + ' mode writes a token the compiler can use as a value and a type', () => {
        const project = projectFor(mode);
        const generated = generate(project);
        assert.strictEqual(generated.status, 0, generated.stdout + generated.stderr);

        assert.ok(exists(project, LAYOUT[mode].artifact), 'wrote ' + LAYOUT[mode].artifact);
        if (mode === 'package') {
            assert.ok(exists(project, 'node_modules/cosdi-tokens/package.json'), 'the package has a manifest');
        }

        const errors = typecheck(project);
        const own = Array.from(errors.keys()).filter((file) => file !== 'assets/Scripts/Probe.ts');
        assert.deepStrictEqual(own, [], 'the project compiles: ' + JSON.stringify(Array.from(errors)));
        assert.ok(errors.has('assets/Scripts/Probe.ts'),
            'a resolve read as the wrong type is caught, so the token carries its type');

        fs.rmSync(project, { recursive: true, force: true });
    });

    check(mode + ' mode generates the same thing twice, and says so', () => {
        const project = projectFor(mode);
        assert.strictEqual(generate(project).status, 0);

        const before = read(project, LAYOUT[mode].artifact);
        const again = generate(project, '--check');
        assert.strictEqual(again.status, 0, again.stdout + again.stderr);
        assert.strictEqual(read(project, LAYOUT[mode].artifact), before, 'nothing moved on the second run');

        fs.rmSync(project, { recursive: true, force: true });
    });

    if (mode === 'package' || mode === 'keys') {
        check(mode + ' mode leaves the assets folder alone', () => {
            const project = projectFor(mode);
            assert.strictEqual(generate(project).status, 0);

            assert.strictEqual(read(project, 'assets/Scripts/IPlayerService.ts'), INTERFACE,
                'the interface file is untouched');
            const stray = fs.readdirSync(path.join(project, 'assets'))
                .filter((name) => name.indexOf('generated') >= 0);
            assert.deepStrictEqual(stray, [], 'nothing generated under assets');

            fs.rmSync(project, { recursive: true, force: true });
        });
    }
}

/** `--mode file` runs one mode; with nothing given, all of them run. */
function chosenModes() {
    const at = process.argv.indexOf('--mode');
    if (at < 0) {
        return MODES;
    }
    const asked = process.argv[at + 1];
    if (MODES.indexOf(asked) < 0) {
        console.error('Unknown mode: ' + asked + '. Modes: ' + MODES.join(', '));
        process.exit(2);
    }
    return [asked];
}

if (runtimeDir) {
    fs.rmSync(runtimeDir, { recursive: true, force: true });
}

if (failures > 0) {
    console.error(failures + ' codegen mode test(s) failed');
    process.exit(1);
}
console.log('codegen mode tests passed');
