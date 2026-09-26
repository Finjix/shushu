@echo off
setlocal
cd /d "%~dp0"

if not exist "public\index.html" (
  echo Cannot find public\index.html. Keep this script in the project root.
  pause
  exit /b 1
)

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 was not found. Install Python 3 and try again.
  pause
  exit /b 1
)

set "PORT=8000"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\free-port.ps1" -Port %PORT%
if errorlevel 1 (
  echo Could not free port %PORT%. The website was not started.
  pause
  exit /b 1
)

echo Starting the website at http://127.0.0.1:%PORT%
echo Keep this window open. Press Ctrl+C to stop the website.
start "" /b powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://127.0.0.1:%PORT%'"
python -m http.server %PORT% --bind 127.0.0.1 --directory "%CD%\public"

if errorlevel 1 (
  echo.
  echo The server could not start on port %PORT%.
  pause
  exit /b 1
)
