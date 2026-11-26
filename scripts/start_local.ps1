# Локальный стенд JUDRIVE (Windows). Запуск из корня репозитория.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root

$BackendPort = if ($env:JUDRIVE_BACKEND_PORT) { $env:JUDRIVE_BACKEND_PORT } else { "8090" }
$Python = Join-Path $Root "backend\.venv\Scripts\python.exe"
$MockVenv = Join-Path $Root "vendor\neurodvs_mock\.venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
  throw "Нет backend venv: backend\.venv"
}

function Start-Bg([string]$Title, [string]$Exe, [string[]]$Args, [hashtable]$EnvExtra = @{}) {
  $psi = @{
    FilePath     = $Exe
    ArgumentList = $Args
    WorkingDirectory = $Root
    WindowStyle  = "Hidden"
  }
  if ($EnvExtra.Count -gt 0) {
    $previous = @{}
    foreach ($k in $EnvExtra.Keys) {
      $previous[$k] = [Environment]::GetEnvironmentVariable($k, "Process")
      [Environment]::SetEnvironmentVariable($k, $EnvExtra[$k], "Process")
    }
  }
  Write-Host "[$Title] $($Exe) $($Args -join ' ')"
  try { Start-Process @psi | Out-Null }
  finally {
    foreach ($k in $EnvExtra.Keys) {
      [Environment]::SetEnvironmentVariable($k, $previous[$k], "Process")
    }
  }
}

if (Test-Path $MockVenv) {
  Start-Bg "mock-ml" $MockVenv @("-m", "uvicorn", "mock_ml.app:app", "--host", "127.0.0.1", "--port", "8001") @{ PYTHONPATH = "vendor\neurodvs_mock" }
  Start-Bg "mock-toir" $MockVenv @("-m", "uvicorn", "mock_toir.app:app", "--host", "127.0.0.1", "--port", "8002") @{ PYTHONPATH = "vendor\neurodvs_mock" }
} else {
  Write-Warning "vendor/neurodvs_mock/.venv не найден — заглушки не запущены"
}

Start-Bg "backend" $Python @("-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", $BackendPort) @{
  PYTHONPATH = "backend"
}

Write-Host ""
Write-Host "Backend: http://127.0.0.1:$BackendPort (JUDRIVE_BACKEND_PORT для смены порта)"
Write-Host "Frontend: npm run dev в .\frontend (прокси /api -> порт $BackendPort)"
Write-Host "Health:   http://127.0.0.1:$BackendPort/api/health"