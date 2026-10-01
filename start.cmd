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

echo Opening the website at http://127.0.0.1:8000/
echo Keep this window open if a new server starts. Press Ctrl+C to stop it.
python "%~dp0scripts\dev-server.py" --open-browser

if errorlevel 1 (
  echo.
  echo The server could not start on port 8000. No existing process was stopped.
  pause
  exit /b 1
)
