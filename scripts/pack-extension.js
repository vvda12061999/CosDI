#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const assets = path.join(root, 'assets', 'CosDI');
const ext = path.join(root, 'extensions', 'cosdi');
const runtime = path.join(ext, 'runtime');
const zip = path.join(root, 'cosdi.zip');
const folderMeta = path.join(root, 'assets', 'CosDI.meta');
const folderMetaDest = path.join(ext, 'static', 'CosDI.folder.meta');
const licenseSrc = path.join(root, 'LICENSE');
const licenseDest = path.join(ext, 'LICENSE');

function rmrf(target) {
    fs.rmSync(target, { recursive: true, force: true });
}

function mkdirp(target) {
    fs.mkdirSync(target, { recursive: true });
}

function copyDir(src, dest, skip = new Set()) {
    mkdirp(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        if (skip.has(entry.name) || entry.name === '.installed-version') {
            continue;
        }
        const from = path.join(src, entry.name);
        const to = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDir(from, to, skip);
        } else {
            fs.copyFileSync(from, to);
        }
    }
}

if (!fs.existsSync(assets)) {
    console.error('Missing', assets);
    process.exit(1);
}

rmrf(runtime);
mkdirp(path.join(ext, 'static'));
copyDir(assets, runtime);
if (fs.existsSync(folderMeta)) {
    fs.copyFileSync(folderMeta, folderMetaDest);
}
if (fs.existsSync(licenseSrc)) {
    fs.copyFileSync(licenseSrc, licenseDest);
}

rmrf(zip);
if (process.platform === 'win32') {
    const ps = [
        'Add-Type -AssemblyName System.IO.Compression.FileSystem;',
        `if (Test-Path -LiteralPath '${zip.replace(/'/g, "''")}') { Remove-Item -LiteralPath '${zip.replace(/'/g, "''")}' -Force };`,
        `[System.IO.Compression.ZipFile]::CreateFromDirectory('${ext.replace(/'/g, "''")}', '${zip.replace(/'/g, "''")}', [System.IO.Compression.CompressionLevel]::Optimal, $false);`,
    ].join(' ');
    execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
} else {
    execFileSync('zip', ['-r', zip, '.'], { cwd: ext, stdio: 'inherit' });
}

const stat = fs.statSync(zip);
console.log('Wrote', zip, '(' + Math.round(stat.size / 1024) + ' KB)');
