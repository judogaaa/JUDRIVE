# Копирует шесть оригинальных PDF в materials/manuals (вне Git).
param(
    [string]$SourceDir = "$env:USERPROFILE\Documents"
)

$dest = Join-Path $PSScriptRoot "..\materials\manuals"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$files = @(
    "ЯМЗ_236_руководство по эксплуатации.pdf",
    "ЯМЗ_236_руководство по РЕМОНТУ.pdf",
    "yamz-536_re_2016.pdf",
    "yamz-536_rk_2013.pdf",
    "zmz-5234_rk_2025.pdf",
    "zmz-40904-40905_rk_2025.pdf"
)

foreach ($name in $files) {
    $src = Join-Path $SourceDir $name
    if (-not (Test-Path $src)) {
        Write-Warning "Не найден: $src"
        continue
    }
    Copy-Item $src (Join-Path $dest $name) -Force
    Write-Host "OK $name"
}