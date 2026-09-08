#!/usr/bin/env node
'use strict';

/**
 * Compiles the runtime to CommonJS so Node can exercise it. Cocos Creator does
 * the compiling in a real project, and `cc` comes from the engine, so both are
 * stood in for here: `.ts` import specifiers are rewritten and `cc` resolves to
 * a stub with only what the runtime touches.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const stub = path.join(__dirname, 'runtime-test', 'cc-stub.ts');

function typescriptBin() {
    const local = path.join(root, 'node_modules', 'typescript', 'bin', 'tsc');
    if (!fs.existsSync(local)) {
        throw new Error('TypeScript is missing. Run: npm install');
    }
    return local;
}

function copySources(from, to) {
    fs.mkdirSync(to, { recursive: true });
    for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
        const source = path.join(from, entry.name);
        const target = path.join(to, entry.name);
        if (entry.isDirectory()) {
            copySources(source, target);
        } else if (entry.name.endsWith('.ts')) {
            const text = fs.readFileSync(source, 'utf8').replace(/(from\s+'\.[^']*)\.ts'/g, "$1'");
            fs.writeFileSync(target, text, 'utf8');
        }
    }
}

/** Returns the directory holding the compiled runtime, with index.js at its root. */
function buildRuntime() {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-runtime-'));
    copySources(path.join(root, 'assets', 'CosDI'), path.join(work, 'src'));
    fs.copyFileSync(stub, path.join(work, 'cc-stub.ts'));
    fs.writeFileSync(
        path.join(work, 'tsconfig.json'),
        JSON.stringify({
            compilerOptions: {
                target: 'ES2019',
                module: 'commonjs',
                moduleResolution: 'node',
                strict: false,
                experimentalDecorators: true,
                skipLibCheck: true,
                esModuleInterop: true,
                outDir: 'out',
                baseUrl: '.',
                paths: { cc: ['./cc-stub.ts'] },
            },
            include: ['src/**/*.ts', 'cc-stub.ts'],
        }, null, 2),
    );

    try {
        execFileSync(process.execPath, [typescriptBin(), '--project', work], { encoding: 'utf8' });
    } catch (error) {
        // The runtime leans on Cocos types the stub only approximates, so type
        // errors are expected; a missing emit is not.
        const emitted = fs.existsSync(path.join(work, 'out', 'src', 'Runtime', 'index.js'));
        if (!emitted) {
            throw new Error('Runtime failed to compile:\n' + (error.stdout || error.message));
        }
    }

    // `paths` only guides the type checker; Node still resolves `cc` on its own.
    const ccModule = path.join(work, 'out', 'node_modules', 'cc');
    fs.mkdirSync(ccModule, { recursive: true });
    fs.writeFileSync(path.join(ccModule, 'index.js'), "module.exports = require('../../cc-stub.js');\n", 'utf8');

    return path.join(work, 'out', 'src', 'Runtime');
}

module.exports = { buildRuntime };
