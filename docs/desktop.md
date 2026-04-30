# 桌面端

WorldEngine 通过 Electron 打包为原生桌面应用，支持 macOS 和 Windows。本文说明如何构建桌面版，以及桌面版的运行机制。

---

## 用户安装

如果你只是想使用 WorldEngine，直接从 [Releases 页面](https://github.com/n0ctx/WorldEngine/releases) 下载安装包即可，不需要 Node.js。

| 平台 | 文件 |
|---|---|
| macOS（Apple Silicon） | `WorldEngine-*-arm64.dmg` |
| macOS（Intel） | `WorldEngine-*-x64.dmg` |
| Windows（x64） | `WorldEngine-*-x64-setup.exe` |

---

## 数据目录

桌面版的所有数据（数据库、配置、日志、向量索引）存储在用户目录：

| 平台 | 数据目录 |
|---|---|
| macOS | `~/Library/Application Support/worldengine-desktop/` |
| Windows | `%APPDATA%\worldengine-desktop\` |

数据目录结构：
```
worldengine-desktop/
  worldengine.db          # SQLite 数据库
  config.json             # 全局配置（含 API Key，注意保密）
  /uploads/               # 头像和消息附件
  /vectors/               # 向量索引文件
  /logs/                  # 运行日志
  /long_term_memory/      # 长期记忆文件
```

卸载应用不会删除这个目录，数据不丢失。需要完整清理时手动删除。

---

## 构建桌面版

### 环境要求

- Node.js 18+
- 已完成 `npm install --prefix frontend` 和 `npm install --prefix backend`

### 首次构建（含 Node runtime 下载）

```bash
npm run desktop:dist
```

首次运行时会下载打包所需的 Node.js runtime，大约需要几分钟（视网络速度）。  
下载完成后，打包产物输出到 `desktop/dist/`。

后续构建不需要重新下载 runtime，直接运行同一命令即可。

### 构建产物

```
desktop/dist/
  *.dmg          # macOS 安装包
  *.exe          # Windows 安装包
  *.zip          # 便携版（无需安装）
```

---

## 运行机制

桌面版将 Express 后端和 React 前端一起打包进 Electron，启动时：

1. Electron 主进程启动
2. 后端服务在**随机端口**启动（避免与本地其他服务冲突）
3. Electron 渲染进程访问本地后端端口
4. 用户看到的界面与 Web 版完全相同

随机端口由 Electron 主进程动态分配，每次启动可能不同，但前端会自动获取正确地址，无需用户手动配置。

---

## 从开发模式迁移数据

开发模式（`npm run dev`）和桌面版使用不同的数据目录。如果你在开发模式中积累了数据，想迁移到桌面版：

1. 通过 WorldEngine 的**导出**功能导出 `.weworld.json`（包含完整世界数据）
2. 安装桌面版后，通过**导入**功能导入

或者手动复制 `data/` 目录到桌面版的数据目录（需要关闭应用后操作）。

---

## 关键文件

| 文件 | 说明 |
|---|---|
| `desktop/src/` | Electron 主进程代码 |
| `desktop/electron-builder.json` | 打包配置（平台、图标、安装包格式） |
| `desktop/scripts/` | 构建辅助脚本 |
| `desktop/assets/` | 应用图标等资源 |
| `package.json`（根目录） | `desktop:dist` 命令入口 |
