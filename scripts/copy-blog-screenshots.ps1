# Copy store screenshots for Yohan Studio blog public folder
$src = Join-Path $PSScriptRoot '..\docs\store\chrome-web-store\screenshots'
$dest = Join-Path $PSScriptRoot '..\public\blog\snapcontext-v013'

New-Item -ItemType Directory -Force -Path $dest | Out-Null
Copy-Item -Path (Join-Path $src '*.png') -Destination $dest -Force
Write-Host "Copied to $dest"
