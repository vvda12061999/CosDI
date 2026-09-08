#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name === '.git') {
            continue;
        }
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

const command = process.argv[2] || 'install';

if (command === 'tokens') {
    const { loadConfig, generateTokens } = require('../lib/token-codegen.js');
    const check = process.argv.indexOf('--check') >= 0;
    const config = loadConfig(process.cwd());
    if (config.error) {
        console.warn('[CosDI] ' + config.error);
    }
    const result = generateTokens(Object.assign({}, config, { check }));
    for (const warning of result.warnings) {
        console.warn('[CosDI] ' + warning);
    }
    for (const file of result.changed) {
        console.log('[CosDI] ' + (check ? 'stale' : 'wrote') + ' ' + path.relative(process.cwd(), file));
    }
    if (check && result.changed.length) {
        console.error('[CosDI] Interface tokens are out of date. Run: npx cosdi tokens');
        process.exit(1);
    }
    console.log('[CosDI] ' + result.tokens + ' token(s) in ' + result.scanned + ' file(s)');
    process.exit(0);
}

if (command !== 'install') {
    console.log('Usage: npx cosdi install');
    console.log('       npx cosdi tokens [--check]');
    console.log('Run this from your Cocos Creator project root.');
    process.exit(command === 'help' || command === '--help' ? 0 : 1);
}

const src = path.join(__dirname, '..');
const dest = path.join(process.cwd(), 'extensions', 'cosdi');
copyDir(src, dest);
console.log('[CosDI] Installed to ' + dest);
console.log('[CosDI] Enable it: Extension → Extension Manager → Project → CosDI → Enable');
