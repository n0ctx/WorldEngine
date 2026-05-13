# Frontend Architecture

前端顶层结构、页面装配边界与核心入口。

## 顶层结构

```text
frontend/src/
  core/         # API、路由、共享状态、常量、hooks、features、utils
  pages/        # 页面级组合与 page-local 组件
  components/   # ui 原子/分子 + domain 组件
  themes/       # token 默认值与框架样式
  shells/       # 可切换页面壳实现
```

## 核心入口

- `frontend/src/App.jsx`：根应用入口
- `frontend/src/core/router/`：路由与 shell 选择
- `frontend/src/core/state/`：跨页面共享状态
- `frontend/src/core/features/assistant/`：assistant 前端接入边界

## 关键边界

- `core/api/` 是前端网络请求唯一出口，组件内禁止直接 `fetch`
- `core/router/` 负责路由与壳层选择
- `core/state/` 只放跨页面共享状态
- `pages/layout/` 是页面布局契约，不写业务状态
- `components/ui/` 只放领域无关视觉组件
- `shells/` 负责结构与装饰，不替代业务页面逻辑

## 常见落点

- 新页面：`pages/<Page>/index.jsx` + `pages/<Page>/components/`
- 跨页面 domain 组件：`components/<domain>/`
- 真通用 UI：`components/ui/`
- 新 token 或框架样式：`themes/`

## 相关代码文件

- `frontend/src/App.jsx`
- `frontend/src/core/router/`
- `frontend/src/core/features/assistant/`
- `frontend/src/pages/layout/EditPageShell.jsx`
