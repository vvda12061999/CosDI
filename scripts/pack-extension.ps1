# Refresh the extension runtime from assets/CosDI and build cosdi.zip
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
node "$PSScriptRoot\pack-extension.js"
