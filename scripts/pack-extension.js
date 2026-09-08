#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const ext = path.join(root, 'extensions', 'cosdi-diagnostics');
const zip = path.join(root, 'cosdi-diagnostics.zip');
const licenseSrc = path.join(root, 'LICENSE');
const licenseDest = path.join(ext, 'LICENSE');
const excluded = ['node_modules', '.installed-version'];

if (!fs.existsSync(path.join(ext, 'package.json'))) {
    console.error('Missing', ext);
    process.exit(1);
}

if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, licenseDest);
}

fs.rmSync(zip, { recursive: true, force: true });
if (process.platform === 'win32') {
    const quote = (value) => value.replace(/'/g, "''");
    const staging = path.join(root, 'temp', 'cosdi-diagnostics-zip');
    const ps = [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem;',
        `Remove-Item -LiteralPath '${quote(staging)}' -Recurse -Force -ErrorAction SilentlyContinue;`,
        `New-Item -ItemType Directory -Path '${quote(staging)}' -Force | Out-Null;`,
        `Copy-Item -Path '${quote(ext)}\\*' -Destination '${quote(staging)}' -Recurse -Force -Exclude ${excluded.map((name) => `'${quote(name)}'`).join(',')};`,
        `[System.IO.Compression.ZipFile]::CreateFromDirectory('${quote(staging)}', '${quote(zip)}', [System.IO.Compression.CompressionLevel]::Optimal, $false);`,
        `Remove-Item -LiteralPath '${quote(staging)}' -Recurse -Force;`,
    ].join(' ');
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
} else {
    const args = ['-r', zip, '.'];
    for (const name of excluded) {
        args.push('-x', name + '/*', '-x', name);
    }
    execFileSync('zip', args, { cwd: ext, stdio: 'inherit' });
}

const stat = fs.statSync(zip);
console.log('Wrote', zip, '(' + Math.round(stat.size / 1024) + ' KB)');
