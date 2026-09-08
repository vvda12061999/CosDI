# Build cosdi-diagnostics.zip from extensions/cosdi-diagnostics
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
node "$PSScriptRoot\pack-extension.js"
