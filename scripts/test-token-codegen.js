#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { transformSource, generateTokens, loadConfig } = require('../extensions/cosdi-codegen/lib/token-codegen.js');

const run = (source) => transformSource(source, {});
let failed = 0;

function check(name, fn) {
    try {
        fn();
        console.log('ok   ' + name);
    } catch (error) {
        failed++;
        console.error('FAIL ' + name + ': ' + error.message);
    }
}

check('adds the token and the import', () => {
    const out = run([
        "import { _decorator } from 'cc';",
        '',
        '/** @createToken */',
        'export interface IExampleService {',
        '    name: string;',
        '}',
        '',
    ].join('\n'));
    assert.strictEqual(out.text, [
        "import { _decorator } from 'cc';",
        "import { createToken } from 'cosdi';",
        '',
        '/** @createToken */',
        'export interface IExampleService {',
        '    name: string;',
        '}',
        "export const IExampleService = createToken<IExampleService>('IExampleService'); // cosdi:token",
        '',
    ].join('\n'));
    assert.deepStrictEqual(out.warnings, []);
});

check('is idempotent', () => {
    const source = ['/** @createToken */', 'export interface IFoo {', '    a: number;', '}', ''].join('\n');
    const once = run(source).text;
    assert.strictEqual(run(once).text, once);
});

check('merges into an existing cosdi import', () => {
    const out = run([
        "import { inject, injectable } from 'cosdi';",
        '',
        '// @createToken',
        'export interface IFoo {',
        '    a: number;',
        '}',
    ].join('\n'));
    assert.ok(out.text.startsWith("import { createToken, inject, injectable } from 'cosdi';"));
    assert.ok(out.text.indexOf("export const IFoo = createToken<IFoo>('IFoo'); // cosdi:token") > 0);
});

check('keeps a local interface local', () => {
    const out = run(['/** @createToken */', 'interface IFoo {', '    a: number;', '}'].join('\n'));
    assert.ok(out.text.indexOf("\nconst IFoo = createToken<IFoo>('IFoo');") > 0);
    assert.strictEqual(out.text.indexOf('export const IFoo'), -1);
});

check('honours a custom token name', () => {
    const out = run(["/** @createToken('Legacy.IFoo') */", 'export interface IFoo {', '    a: number;', '}'].join('\n'));
    assert.ok(out.text.indexOf("createToken<IFoo>('Legacy.IFoo');") > 0);
});

check('keeps the surrounding indentation', () => {
    const out = run([
        'export namespace Game {',
        '    /** @createToken */',
        '    export interface IFoo {',
        '        a: number;',
        '    }',
        '}',
    ].join('\n'));
    assert.ok(out.text.indexOf("\n    export const IFoo = createToken<IFoo>('IFoo'); // cosdi:token") > 0);
});

check('handles nested braces in the body', () => {
    const out = run([
        '/** @createToken */',
        'export interface IFoo {',
        '    nested: { a: { b: string } };',
        '    fn(cb: () => { c: number }): void;',
        '}',
        'export const after = 1;',
    ].join('\n'));
    const lines = out.text.split('\n');
    assert.strictEqual(lines[lines.length - 2], "export const IFoo = createToken<IFoo>('IFoo'); // cosdi:token");
});

check('handles extends clauses', () => {
    const out = run(['/** @createToken */', 'export interface IFoo extends IBar, IBaz {', '    a: number;', '}'].join('\n'));
    assert.ok(out.text.indexOf("export const IFoo = createToken<IFoo>('IFoo');") > 0);
});

check('removes the token when the tag goes away', () => {
    const tagged = run(['/** @createToken */', 'export interface IFoo {', '    a: number;', '}', ''].join('\n')).text;
    const out = run(tagged.replace('/** @createToken */\n', ''));
    assert.strictEqual(out.text.indexOf('cosdi:token'), -1);
    assert.ok(out.text.indexOf('export interface IFoo') >= 0);
});

check('keeps CRLF line endings', () => {
    const source = ['/** @createToken */', 'export interface IFoo {', '    a: number;', '}', ''].join('\r\n');
    const out = run(source);
    assert.ok(/\}\r\nexport const IFoo = createToken<IFoo>\('IFoo'\); \/\/ cosdi:token\r\n/.test(out.text));
    assert.strictEqual(run(out.text).text, out.text);
});

check('skips generic interfaces', () => {
    const out = run(['/** @createToken */', 'export interface IFoo<T> {', '    a: T;', '}'].join('\n'));
    assert.strictEqual(out.tokens.length, 0);
    assert.ok(/generic/.test(out.warnings[0]), out.warnings[0]);
});

check('points classes at the real decorator', () => {
    const out = run(['/** @createToken */', 'export class Foo {', '}'].join('\n'));
    assert.strictEqual(out.tokens.length, 0);
    assert.ok(/decorator/.test(out.warnings[0]), out.warnings[0]);
});

check('skips a name that already has a value', () => {
    const out = run([
        "import { createToken } from 'cosdi';",
        '/** @createToken */',
        'export interface IFoo {',
        '    a: number;',
        '}',
        "export const IFoo = createToken<IFoo>('IFoo');",
    ].join('\n'));
    assert.strictEqual(out.tokens.length, 0);
    assert.ok(/already has a value/.test(out.warnings[0]), out.warnings[0]);
});

check('ignores tags inside strings', () => {
    const source = [
        "const doc = '@createToken';",
        'const tpl = `@createToken`;',
        'export interface IFoo {',
        '    a: number;',
        '}',
    ].join('\n');
    const out = run(source);
    assert.strictEqual(out.tokens.length, 0);
    assert.strictEqual(out.text, source);
});

check('handles several interfaces in one file', () => {
    const out = run([
        '/** @createToken */',
        'export interface IFoo {',
        '    a: number;',
        '}',
        '',
        '/** @createToken */',
        'export interface IBar {',
        '    b: number;',
        '}',
    ].join('\n'));
    assert.strictEqual(out.tokens.length, 2);
    assert.ok(out.text.indexOf("export const IFoo = createToken<IFoo>('IFoo');") > 0);
    assert.ok(out.text.indexOf("export const IBar = createToken<IBar>('IBar');") > 0);
    assert.strictEqual((out.text.match(/import \{ createToken \}/g) || []).length, 1);
});

check('@generateToken and @createToken mean the same thing', () => {
    const body = ['export interface IFoo {', '    a: number;', '}', ''].join('\n');
    const fromNew = run('/** @generateToken */\n' + body).text;
    const fromOld = run('/** @createToken */\n' + body).text;
    assert.ok(fromNew.indexOf("createToken<IFoo>('IFoo'); // cosdi:token") > 0, fromNew);
    assert.strictEqual(fromNew.replace('@generateToken', '@createToken'), fromOld);
});

check('a line comment carries the tag too', () => {
    const out = run(['// @generateToken', 'export interface IFoo {', '    a: number;', '}'].join('\n'));
    assert.strictEqual(out.tokens.length, 1);
});

check('leaves untagged files untouched', () => {
    const source = ['export interface IFoo {', '    a: number;', '}', ''].join('\n');
    assert.strictEqual(run(source).text, source);
});

function project(files, config) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cosdi-codegen-test-'));
    for (const name of Object.keys(files)) {
        const file = path.join(root, name);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, files[name], 'utf8');
    }
    if (config) {
        fs.writeFileSync(path.join(root, 'cosdi.codegen.json'), JSON.stringify(config), 'utf8');
    }
    return root;
}

const tagged = (name) => ['/** @generateToken */', 'export interface ' + name + ' {', '    a: number;', '}', ''].join('\n');

check('config falls back to defaults, which keep generated code out of assets', () => {
    const root = project({ 'assets/Scripts/A.ts': tagged('IA') });
    const config = loadConfig(root);
    assert.deepStrictEqual(config.roots, [path.join(root, 'assets')]);
    assert.strictEqual(config.mode, 'package');
    assert.strictEqual(config.out, path.join(root, 'node_modules', 'cosdi-tokens'));
    assert.strictEqual(config.generateOnSave, true);
    assert.strictEqual(config.error, null);
});

check('the default run writes a token package and leaves the source alone', () => {
    const source = tagged('IA');
    const root = project({ 'assets/Scripts/A.ts': source });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8'), source);
    const index = fs.readFileSync(path.join(root, 'node_modules/cosdi-tokens/index.ts'), 'utf8');
    assert.match(index, /export const IA = createToken<IA_>\('IA'\);/);
});

check('config narrows the roots that are scanned', () => {
    const root = project({
        'assets/Scripts/A.ts': tagged('IA'),
        'assets/Legacy/B.ts': tagged('IB'),
    }, { mode: 'inline', roots: ['assets/Scripts'] });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    assert.ok(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8').indexOf('cosdi:token') > 0);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Legacy/B.ts'), 'utf8').indexOf('cosdi:token'), -1);
});

check('config reports broken JSON instead of throwing', () => {
    const root = project({});
    fs.writeFileSync(path.join(root, 'cosdi.codegen.json'), '{ oops', 'utf8');
    const config = loadConfig(root);
    assert.ok(/not valid JSON/.test(config.error), String(config.error));
    assert.deepStrictEqual(config.roots, [path.join(root, 'assets')]);
});

check('a single file can be regenerated on its own', () => {
    const root = project({
        'assets/Scripts/A.ts': tagged('IA'),
        'assets/Scripts/B.ts': tagged('IB'),
    }, { mode: 'inline' });
    const config = loadConfig(root);
    const result = generateTokens(Object.assign({}, config, { files: [path.join(root, 'assets/Scripts/A.ts')] }));
    assert.strictEqual(result.scanned, 1);
    assert.ok(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8').indexOf('cosdi:token') > 0);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/B.ts'), 'utf8').indexOf('cosdi:token'), -1);
});

check('file mode keeps sources untouched', () => {
    const source = tagged('IA');
    const root = project({ 'assets/Scripts/A.ts': source }, { mode: 'file', out: 'assets/Tokens.generated.ts' });
    const config = loadConfig(root);
    const result = generateTokens(config);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8'), source);
    const generated = fs.readFileSync(path.join(root, 'assets/Tokens.generated.ts'), 'utf8');
    assert.ok(generated.indexOf("import type { IA as IA_ } from './Scripts/A';") > 0, generated);
    assert.ok(generated.indexOf('export type IA = IA_;') > 0, generated);
    assert.ok(generated.indexOf("export const IA = createToken<IA_>('IA');") > 0, generated);
    assert.strictEqual(result.changed.length, 1);
    assert.strictEqual(generateTokens(loadConfig(root)).changed.length, 0, 'second run is a no-op');
});

check('file mode clears inline tokens left from the other mode', () => {
    const root = project({ 'assets/Scripts/A.ts': tagged('IA') }, { mode: 'inline' });
    generateTokens(loadConfig(root));
    assert.ok(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8').indexOf('cosdi:token') > 0);

    fs.writeFileSync(path.join(root, 'cosdi.codegen.json'), JSON.stringify({ mode: 'file' }), 'utf8');
    generateTokens(loadConfig(root));
    const source = fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8');
    assert.strictEqual(source.indexOf('cosdi:token'), -1, 'inline token removed');
    assert.ok(fs.existsSync(path.join(root, 'assets/cosdi-tokens.generated.ts')));
});

check('file mode reports duplicate interface names', () => {
    const root = project({
        'assets/Scripts/A.ts': tagged('IDup'),
        'assets/Scripts/B.ts': tagged('IDup'),
    }, { mode: 'file' });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    assert.ok(/already generated from/.test(result.warnings[0]), String(result.warnings[0]));
});

check('file mode removes the module when the last tag goes', () => {
    const root = project({ 'assets/Scripts/A.ts': tagged('IA') }, { mode: 'file' });
    generateTokens(loadConfig(root));
    const out = path.join(root, 'assets/cosdi-tokens.generated.ts');
    assert.ok(fs.existsSync(out));

    fs.writeFileSync(path.join(root, 'assets/Scripts/A.ts'), tagged('IA').replace('/** @generateToken */\n', ''), 'utf8');
    generateTokens(loadConfig(root));
    assert.strictEqual(fs.existsSync(out), false);
});

check('package mode generates outside assets', () => {
    const source = tagged('IA');
    const root = project({ 'assets/Scripts/A.ts': source }, { mode: 'package', packageName: 'game-tokens' });
    const config = loadConfig(root);
    assert.strictEqual(config.out, path.join(root, 'node_modules', 'game-tokens'));

    generateTokens(config);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8'), source, 'sources untouched');

    const index = fs.readFileSync(path.join(root, 'node_modules/game-tokens/index.ts'), 'utf8');
    assert.ok(index.indexOf("import type { IA as IA_ } from '../../assets/Scripts/A';") > 0, index);
    assert.ok(index.indexOf("export const IA = createToken<IA_>('IA');") > 0, index);

    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'node_modules/game-tokens/package.json'), 'utf8'));
    assert.strictEqual(manifest.name, 'game-tokens');
    assert.strictEqual(manifest.main, './index.ts');
    assert.strictEqual(generateTokens(loadConfig(root)).changed.length, 0, 'second run is a no-op');
});

check('package mode cleans up when the last tag goes', () => {
    const root = project({ 'assets/Scripts/A.ts': tagged('IA') }, { mode: 'package' });
    generateTokens(loadConfig(root));
    const index = path.join(root, 'node_modules/cosdi-tokens/index.ts');
    assert.ok(fs.existsSync(index));

    fs.writeFileSync(path.join(root, 'assets/Scripts/A.ts'), tagged('IA').replace('/** @generateToken */\n', ''), 'utf8');
    generateTokens(loadConfig(root));
    assert.strictEqual(fs.existsSync(index), false);
    assert.strictEqual(fs.existsSync(path.join(root, 'node_modules/cosdi-tokens/package.json')), false);
});

check('file mode warns when the module lands outside assets', () => {
    const root = project({ 'assets/Scripts/A.ts': tagged('IA') }, { mode: 'file', out: 'generated/Tokens.ts' });
    const result = generateTokens(loadConfig(root));
    assert.ok(/only compiles scripts under assets/.test(result.warnings.join('\n')), result.warnings.join('\n'));
});

const plain = (name) => ['export interface ' + name + ' {', '    a: number;', '}', ''].join('\n');

check('keys mode maps tagged interfaces and leaves the source alone', () => {
    const source = tagged('IA');
    const root = project({ 'assets/Scripts/A.ts': source }, { mode: 'keys' });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8'), source, 'source untouched');

    const declaration = fs.readFileSync(path.join(root, 'cosdi-service-keys.d.ts'), 'utf8');
    assert.ok(/declare module 'cosdi'/.test(declaration), declaration);
    assert.ok(/interface ServiceTypes/.test(declaration), declaration);
    assert.ok(/'IA': IA_;/.test(declaration), declaration);
    assert.ok(/import type \{ IA as IA_ \} from '\.\/assets\/Scripts\/A';/.test(declaration), declaration);
    assert.strictEqual(generateTokens(loadConfig(root)).changed.length, 0, 'second run is a no-op');
});

check('keys mode with include exported needs no tag at all', () => {
    const root = project({ 'assets/Scripts/A.ts': plain('IA') }, { mode: 'keys', include: 'exported' });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    assert.ok(/'IA': IA_;/.test(fs.readFileSync(path.join(root, 'cosdi-service-keys.d.ts'), 'utf8')));
});

check('keys mode skips interfaces that are not exported or are generic', () => {
    const root = project({
        'assets/Scripts/A.ts': [
            'interface IPrivate { a: number; }',
            'export interface IGeneric<T> { a: T; }',
            'export interface IPlain { a: number; }',
            '',
        ].join('\n'),
    }, { mode: 'keys', include: 'exported' });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    const declaration = fs.readFileSync(path.join(root, 'cosdi-service-keys.d.ts'), 'utf8');
    assert.ok(/'IPlain'/.test(declaration), declaration);
    assert.strictEqual(/IPrivate|IGeneric/.test(declaration), false, declaration);
});

check('keys mode honours a custom key name from the tag', () => {
    const root = project({
        'assets/Scripts/A.ts': tagged('IA').replace('@generateToken', "@generateToken('Game.IA')"),
    }, { mode: 'keys' });
    generateTokens(loadConfig(root));
    const declaration = fs.readFileSync(path.join(root, 'cosdi-service-keys.d.ts'), 'utf8');
    assert.ok(/'Game\.IA': IA_;/.test(declaration), declaration);
});

check('keys mode reports a name claimed by two files', () => {
    const root = project({
        'assets/Scripts/A.ts': plain('IA'),
        'assets/Scripts/B.ts': plain('IA'),
    }, { mode: 'keys', include: 'exported' });
    const result = generateTokens(loadConfig(root));
    assert.strictEqual(result.tokens, 1);
    assert.ok(/already mapped from/.test(result.warnings.join('\n')), result.warnings.join('\n'));
});

check('keys mode clears inline tokens left from the other mode', () => {
    const root = project({ 'assets/Scripts/A.ts': tagged('IA') }, { mode: 'inline' });
    generateTokens(loadConfig(root));
    assert.ok(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8').indexOf('cosdi:token') > 0);

    fs.writeFileSync(path.join(root, 'cosdi.codegen.json'), JSON.stringify({ mode: 'keys' }), 'utf8');
    generateTokens(loadConfig(root));
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8').indexOf('cosdi:token'), -1);
    assert.ok(fs.existsSync(path.join(root, 'cosdi-service-keys.d.ts')));
});

check('keys mode removes the declaration when the last interface goes', () => {
    const root = project({ 'assets/Scripts/A.ts': plain('IA') }, { mode: 'keys', include: 'exported' });
    generateTokens(loadConfig(root));
    const out = path.join(root, 'cosdi-service-keys.d.ts');
    assert.ok(fs.existsSync(out));

    fs.writeFileSync(path.join(root, 'assets/Scripts/A.ts'), 'export const nothing = 1;\n', 'utf8');
    generateTokens(loadConfig(root));
    assert.strictEqual(fs.existsSync(out), false);
});

check('keys mode writes nothing under check', () => {
    const root = project({ 'assets/Scripts/A.ts': plain('IA') }, { mode: 'keys', include: 'exported' });
    const result = generateTokens(Object.assign({}, loadConfig(root), { check: true }));
    assert.strictEqual(result.changed.length, 1);
    assert.strictEqual(fs.existsSync(path.join(root, 'cosdi-service-keys.d.ts')), false);
});

check('check mode writes nothing', () => {
    const source = tagged('IA');
    const root = project({ 'assets/Scripts/A.ts': source }, { mode: 'inline' });
    const result = generateTokens(Object.assign({}, loadConfig(root), { check: true }));
    assert.strictEqual(result.changed.length, 1);
    assert.strictEqual(fs.readFileSync(path.join(root, 'assets/Scripts/A.ts'), 'utf8'), source);
});

if (failed) {
    console.error(failed + ' test(s) failed');
    process.exit(1);
}
console.log('All token codegen tests passed');
