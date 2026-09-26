param(
  [int]$Port = 8000
)

$ErrorActionPreference = 'Stop'

try {
  $ownerProcessIds = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique)

  foreach ($ownerProcessId in $ownerProcessIds) {
    if ($ownerProcessId -eq $PID) {
      throw "The current PowerShell process owns port $Port and cannot stop itself safely."
    }

    $ownerProcess = Get-Process -Id $ownerProcessId
    Write-Host "Stopping $($ownerProcess.ProcessName) (PID $ownerProcessId) on port $Port..."
    Stop-Process -Id $ownerProcessId -Force
  }

  for ($attempt = 0; $attempt -lt 20; $attempt += 1) {
    if (-not (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)) {
      exit 0
    }
    Start-Sleep -Milliseconds 100
  }

  throw "Port $Port is still occupied."
} catch {
  Write-Error "Unable to free port ${Port}: $_"
  exit 1
}
