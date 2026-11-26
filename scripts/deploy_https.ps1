# Сборка и подготовка статики для reverse-proxy (Caddy/nginx). Запуск с правами администратора не требуется.
param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [string]$DistOut = "",
  [int]$BackendPort = 8090
)

$ErrorActionPreference = "Stop"
Set-Location $RepoRoot

if (-not $DistOut) { $DistOut = Join-Path $RepoRoot "deploy\dist" }

Write-Host "=== frontend build ==="
Set-Location (Join-Path $RepoRoot "frontend")
npm run build | Write-Host
if (-not (Test-Path "dist")) { throw "frontend/dist missing" }

Write-Host "=== copy dist -> $DistOut ==="
New-Item -ItemType Directory -Force -Path $DistOut | Out-Null
Remove-Item -Recurse -Force (Join-Path $DistOut "*") -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "dist\*" $DistOut

$readme = @"
JUDRIVE static build $(Get-Date -Format 'yyyy-MM-dd HH:mm')
Backend expected at http://127.0.0.1:$BackendPort (proxy /api/*).
See docs/DEPLOY_HTTPS.md for Caddy example.
"@
Set-Content -Path (Join-Path $DistOut "BUILD.txt") -Value $readme -Encoding UTF8

Write-Host "Done. Serve $DistOut via HTTPS proxy; API -> port $BackendPort"