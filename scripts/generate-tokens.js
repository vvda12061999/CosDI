#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadConfig, generateTokens } = require('../extensions/cosdi-codegen/lib/token-codegen.js');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const check = args.indexOf('--check') >= 0;
const overrides = args.filter((arg) => !arg.startsWith('--')).map((arg) => path.resolve(root, arg));

const config = loadConfig(root);
if (config.error) {
    console.warn('[CosDI] ' + config.error);
}

const result = generateTokens(Object.assign({}, config, {
    roots: overrides.length ? overrides : config.roots,
    check,
}));

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
