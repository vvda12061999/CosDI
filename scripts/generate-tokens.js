#!/usr/bin/env node
'use strict';

const path = require('path');
const { generateTokens } = require('../extensions/cosdi/lib/token-codegen.js');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const check = args.indexOf('--check') >= 0;
const roots = args.filter((arg) => !arg.startsWith('--')).map((arg) => path.resolve(root, arg));

const result = generateTokens({
    roots: roots.length ? roots : [path.join(root, 'assets')],
    check,
});

for (const warning of result.warnings) {
    console.warn('[CosDI] ' + path.relative(root, warning));
}

for (const file of result.changed) {
    console.log('[CosDI] ' + (check ? 'stale' : 'wrote') + ' ' + path.relative(root, file));
}

if (check && result.changed.length) {
    console.error('[CosDI] Interface tokens are out of date. Run: node scripts/generate-tokens.js');
    process.exit(1);
}

console.log('[CosDI] ' + result.tokens + ' token(s) in ' + result.scanned + ' file(s)'
    + (check ? ' are up to date' : ''));
