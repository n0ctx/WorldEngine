# WorldEngine 前端

WorldEngine 的浏览器端：React 19 + Vite + TailwindCSS + Zustand。

## 本目录命令

```bash
npm install        # 首次安装依赖
npm run dev        # 启动开发服务器（默认 http://localhost:5173，会自动 kill 5173 残留进程）
npm run build      # 生产构建，产物在 dist/
npm run preview    # 本地预览构建产物
npm run lint       # eslint
npm run test       # vitest run（一次性运行）
npm run test:watch # vitest 监听模式
```

后端入口在 `../backend/`，开发时需要在另一个终端运行 `npm run dev`（默认 http://localhost:3000）。

## 进一步阅读

- 项目总体说明：[`../README.md`](../README.md)
- agent 协作入口：[`../CLAUDE.md`](../CLAUDE.md)
- 前端文档索引：[`../docs/references/frontend/index.md`](../docs/references/frontend/index.md)
- 主题与 token 规则：[`../docs/references/frontend/ui-and-theme.md`](../docs/references/frontend/ui-and-theme.md)
