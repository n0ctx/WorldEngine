#!/bin/bash
# 双击此文件即可启动 WorldEngine（前端 + 后端）
# 前端: http://localhost:5173
# 后端: http://localhost:3000

cd "$(dirname "$0")"

# 每次启动都同步依赖，避免 git pull 后依赖不一致导致启动失败。
# 依赖已是最新时 npm install 几乎瞬间返回，不影响启动速度。
# 根 install 覆盖 workspaces（frontend、assistant/client）与 assistant/server 用到的 express，
# 不要再单独 npm install --prefix frontend，否则会生成重复的 react 副本。
echo "同步根依赖（含前端 / 写卡助手）..."
npm install || { echo "根依赖安装失败，请检查网络或 npm 配置"; exit 1; }

echo "同步后端依赖..."
npm install --prefix backend || { echo "后端依赖安装失败，请检查网络或 npm 配置"; exit 1; }

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
