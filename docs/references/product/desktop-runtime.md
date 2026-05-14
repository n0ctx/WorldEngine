# Desktop Runtime

Electron 主进程、preload、安全桥接与打包辅助脚本。

## 什么时候读

- 改 `desktop/src/` 主进程逻辑
- 改 preload、安全桥接、桌面端后端启动方式
- 改 `desktop/scripts/` 打包准备或清理脚本

## 关键行为

- `desktop/src/main.js` 负责启动 Electron 窗口、拉起后端、监听崩溃并尝试恢复
- 桌面端后端通过子进程启动 `backend/server.js`，并注入 `WE_SERVE_STATIC=true`、`WE_DATA_DIR=userData`、随机端口
- `desktop/src/preload.js` 当前不向前端暴露 Node API，是安全白名单桥的唯一入口
- `desktop/src/utils.js` 负责端口探测与开发/打包模式下的项目根目录解析
- `desktop/electron-builder.json` 负责把 `frontend/dist`、`backend`、`assistant`、`shared` 和根目录 `themes` 内置主题一起放进 `resources`
- `desktop/scripts/prepare-build.js` 下载并瘦身随包分发的 Node runtime
- `desktop/scripts/clean-dist.js` 清理 `desktop/dist/`

## 修改时要同步什么

- 改后端启动参数、数据目录、端口恢复或随包资源：同步 [`desktop-and-packaging.md`](desktop-and-packaging.md)
- 改 preload 暴露能力：同步本页与前端接入文档
- 改 runtime 下载目标平台、Node 版本、瘦身策略：同步本页与打包文档

## 相关代码文件

- `desktop/src/main.js`
- `desktop/src/preload.js`
- `desktop/src/utils.js`
- `desktop/scripts/prepare-build.js`
- `desktop/scripts/clean-dist.js`
