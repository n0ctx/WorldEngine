@echo off
chcp 65001 >nul
title WorldEngine

cd /d "%~dp0"

echo.
echo =========================================
echo   WorldEngine 启动中...
echo   前端: http://localhost:5173
echo   后端: http://localhost:3000
echo   按 Ctrl+C 停止所有服务
echo =========================================
echo.

if not exist "node_modules" (
  echo 首次启动，安装依赖...
  call npm install
)

if not exist "frontend\node_modules" (
  echo 安装前端依赖...
  call npm install --prefix frontend
)

if not exist "backend\node_modules" (
  echo 安装后端依赖...
  call npm install --prefix backend
)

rem 后台等待服务启动后自动打开浏览器
start "" /b cmd /c "timeout /t 4 >nul && start http://localhost:5173"

call npm run dev
pause
