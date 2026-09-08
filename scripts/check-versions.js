#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const files = [
    'package.json',
    path.join('assets', 'CosDI', 'package.json'),
    path.join('extensions', 'cosdi-diagnostics', 'package.json'),
    path.join('extensions', 'cosdi-codegen', 'package.json'),
];

const versions = files.map((file) => {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    return { file, version: String(json.version || '') };
});

const unique = new Set(versions.map((entry) => entry.version));
if (unique.size !== 1 || unique.has('')) {
    console.error('Versions are out of sync. Run node scripts/bump-version.js <version>.');
    for (const entry of versions) {
        console.error('  ' + entry.file + ' -> ' + (entry.version || '(missing)'));
    }
    process.exit(1);
}

console.log('All packages at v' + versions[0].version);
