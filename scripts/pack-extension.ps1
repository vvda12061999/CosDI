# Refresh the extension runtime from assets/CosDI and build cosdi.zip
# for Extension Manager → Import.

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$assets = Join-Path $root "assets\CosDI"
$runtime = Join-Path $root "extensions\cosdi\runtime"
$ext = Join-Path $root "extensions\cosdi"
$zip = Join-Path $root "cosdi.zip"
$folderMeta = Join-Path $root "assets\CosDI.meta"
$folderMetaDest = Join-Path $ext "static\CosDI.folder.meta"

if (-not (Test-Path $assets)) {
    throw "Missing $assets"
}

if (Test-Path $runtime) {
    Remove-Item $runtime -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $runtime, (Join-Path $ext "static") | Out-Null
Copy-Item -Path (Join-Path $assets "*") -Destination $runtime -Recurse -Force
if (Test-Path (Join-Path $runtime ".installed-version")) {
    Remove-Item (Join-Path $runtime ".installed-version") -Force
}
if (Test-Path $folderMeta) {
    Copy-Item $folderMeta $folderMetaDest -Force
}

if (Test-Path $zip) {
    Remove-Item $zip -Force
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($ext, $zip, [System.IO.Compression.CompressionLevel]::Optimal, $false)
Write-Host "Wrote $zip"
