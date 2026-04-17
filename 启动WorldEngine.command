#!/bin/bash
# 双击此文件即可启动 WorldEngine（前端 + 后端）
# 前端: http://localhost:5173
# 后端: http://localhost:3000

cd "$(dirname "$0")"

# 检查 node_modules 是否存在，不存在则先安装
if [ ! -d "node_modules" ]; then
  echo "首次启动，安装依赖..."
  npm install
fi

if [ ! -d "frontend/node_modules" ]; then
  echo "安装前端依赖..."
  npm install --prefix frontend
fi

if [ ! -d "backend/node_modules" ]; then
  echo "安装后端依赖..."
  npm install --prefix backend
fi

echo ""
echo "========================================="
echo "  WorldEngine 启动中..."
echo "  前端: http://localhost:5173"
echo "  后端: http://localhost:3000"
echo "  按 Ctrl+C 停止所有服务"
echo "========================================="
echo ""

# 后台等待服务启动后自动打开浏览器
(sleep 4 && open http://localhost:5173) &

export LOG_LEVEL=debug
npm run dev
