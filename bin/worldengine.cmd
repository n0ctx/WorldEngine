@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

cd /d "%~dp0.."

rem Listen on all interfaces so Windows host can reach WSL instance
if not defined HOST set HOST=0.0.0.0

rem Sync dependencies if missing
if not exist "node_modules" (
  call npm install
)
if not exist "backend\node_modules" (
  call npm install --prefix backend
)

echo Starting WorldEngine dev server...
npm run dev