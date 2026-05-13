# Backend Runtime Infra

后端 hooks、middleware、utils 基础设施与运行时支撑模块。

## 什么时候读

- 改 `backend/hooks/`、`backend/middleware/`、`backend/utils/`
- 改日志、request id、代理、安全限制、异步 runner、cleanup hooks
- 查某个底层工具应该放在哪一层

## 目录分工

- `backend/hooks/`：hook 注册表与事件分发基础能力
- `backend/middleware/`：Express 中间件，如 request id 注入
- `backend/utils/logger.js`：日志、preview、spinner、文件写入
- `backend/utils/request-context.js`：请求上下文传递
- `backend/utils/hook-loader.js`：加载根目录 `hooks/` 用户脚本
- `backend/utils/async-queue.js` / `post-gen-runner.js`：后处理队列基础设施
- `backend/utils/cleanup-hooks.js` / `file-cleanup.js`：删除副作用清理
- `backend/utils/network-safety.js` / `proxy.js`：网络安全与代理支持

## 高频任务快速分流

- 改请求级上下文、`x-request-id`：看 `backend/middleware/request-id.js`
- 改日志级别、文件输出、prompt preview：看 `backend/utils/logger.js`
- 改用户 hook 加载、注册、容错：看 `backend/hooks/hook-registry.js` 与 `backend/utils/hook-loader.js`
- 改异步任务队列：看 `backend/utils/async-queue.js` 与 `backend/utils/post-gen-runner.js`
- 改删除副作用基础设施：看 `backend/utils/cleanup-hooks.js`

## 相关代码文件

- `backend/hooks/hook-registry.js`
- `backend/middleware/request-id.js`
- `backend/utils/logger.js`
- `backend/utils/hook-loader.js`
- `backend/utils/async-queue.js`
- `backend/utils/cleanup-hooks.js`
