#!/usr/bin/env node
'use strict';

const path = require('path');
const { loadConfig, generateTokens } = require('../lib/token-codegen.js');

const args = process.argv.slice(2);
if (args.indexOf('--help') >= 0 || args.indexOf('-h') >= 0) {
    console.log('Usage: cosdi-codegen [--check]');
    console.log('Run this from your Cocos Creator project root.');
    process.exit(0);
}

const check = args.indexOf('--check') >= 0;
const config = loadConfig(process.cwd());
if (config.error) {
    console.warn('[CosDI] ' + config.error);
}

const result = generateTokens(Object.assign({}, config, { check }));

const unit = config.mode === 'keys' ? 'service key(s)' : 'token(s)';

for (const warning of result.warnings) {
    console.warn('[CosDI] ' + warning);
}

for (const file of result.changed) {
    console.log('[CosDI] ' + (check ? 'stale' : 'wrote') + ' ' + path.relative(process.cwd(), file));
}

if (check && result.changed.length) {
    console.error('[CosDI] Interface tokens are out of date. Run: npx cosdi-codegen');
    process.exit(1);
}

console.log('[CosDI] ' + result.tokens + ' ' + unit + ' in ' + result.scanned + ' file(s)');
