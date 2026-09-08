#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const next = process.argv[2];
if (!next || !/^\d+\.\d+\.\d+$/.test(next)) {
    console.error('Usage: node scripts/bump-version.js 1.0.1');
    process.exit(1);
}

const files = [
    'package.json',
    path.join('assets', 'CosDI', 'package.json'),
    path.join('extensions', 'cosdi-diagnostics', 'package.json'),
];

for (const file of files) {
    const json = JSON.parse(fs.readFileSync(file, 'utf8'));
    json.version = next;
    fs.writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
    console.log('Updated', file, '->', next);
}

console.log('Next:');
console.log('  git add ' + files.join(' '));
console.log('  git commit -m "Release v' + next + '"');
console.log('  git tag v' + next);
console.log('  git push origin master --tags');
