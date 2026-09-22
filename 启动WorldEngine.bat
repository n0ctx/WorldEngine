@echo off
rem Keep this file pure ASCII: cmd misparses multi-byte UTF-8 lines in batch files.
chcp 65001 >nul
title WorldEngine

cd /d "%~dp0"

echo.
echo =========================================
echo   WorldEngine starting...
echo   Frontend: http://localhost:5173
echo   Backend:  http://localhost:3000
echo   Press Ctrl+C to stop all services
echo =========================================
echo.

rem Sync dependencies on every launch so a git pull never leaves them stale.
rem npm install returns almost instantly when everything is up to date.
rem Root install covers the workspaces (frontend, assistant/client) and the express
rem used by assistant/server. Do NOT run npm install --prefix frontend separately,
rem it creates a duplicate react copy.
echo Syncing root dependencies (frontend / assistant)...
call npm install
if errorlevel 1 (
  echo Root dependency install failed, check network or npm config.
  pause
  exit /b 1
)

echo Syncing backend dependencies...
call npm install --prefix backend
if errorlevel 1 (
  echo Backend dependency install failed, check network or npm config.
  pause
  exit /b 1
)

rem Open the browser once the servers have had time to start
start "" /b cmd /c "timeout /t 4 >nul && start http://localhost:5173"

set LOG_LEVEL=debug
call npm run dev
pause
