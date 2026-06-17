# Frontend Routing And State

前端路由、共享状态、跨页面 hooks 与 API 封装边界。

## 真源目录

- 路由：`frontend/src/core/router/`
- 共享状态：`frontend/src/core/state/`
- 跨页面 hooks：`frontend/src/core/hooks/`
- 页面局部 hooks：`frontend/src/pages/<Page>/hooks/`（仅服务该页，禁止跨页引用）
- 网络请求：`frontend/src/core/api/`
- assistant 前端功能：`frontend/src/core/features/assistant/`
- 工具与日志：`frontend/src/core/utils/`

## 当前约束

- 组件内禁止直接 `fetch`
- 局部 UI 状态优先留在页面或组件内部，只有跨页面共享时才进 `core/state/`
- assistant 前端能力只允许通过 `core/features/assistant/` 暴露给页面
- 路由切换、副作用、数据获取不要埋进纯 UI 组件

## 相关代码文件

- `frontend/src/core/router/`
- `frontend/src/core/state/`
- `frontend/src/core/api/`
- `frontend/src/core/features/assistant/`
