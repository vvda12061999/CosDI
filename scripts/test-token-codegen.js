#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { transformSource } = require('../extensions/cosdi/lib/token-codegen.js');

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

check('leaves untagged files untouched', () => {
    const source = ['export interface IFoo {', '    a: number;', '}', ''].join('\n');
    assert.strictEqual(run(source).text, source);
});

if (failed) {
    console.error(failed + ' test(s) failed');
    process.exit(1);
}
console.log('All token codegen tests passed');
