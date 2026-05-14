# Desktop And Packaging

Electron 桌面端、打包命令、产物路径与数据目录。

## 当前命令

```bash
npm run desktop:dist
```

## 产物目录

- `desktop/dist/`

## 数据目录

- macOS：`~/Library/Application Support/worldengine-desktop/`
- Windows：`%APPDATA%/worldengine-desktop/`

## 补充

- 日志文件位于 `data/logs/worldengine-YYYY-MM-DD.log`
- 日志级别由 `data/config.json` 的 `logging` 配置块控制
- 桌面包必须随包携带根目录 `themes/` 下的内置主题；后端主题服务会从 `resources/themes` 读取内置主题 CSS，用户导入主题则继续写入数据目录 `themes/`

## 代码入口

- 主进程与 preload：[`desktop-runtime.md`](desktop-runtime.md)

## 相关代码文件

- `desktop/package.json`
- `desktop/src/main.js`
- `desktop/scripts/prepare-build.js`
