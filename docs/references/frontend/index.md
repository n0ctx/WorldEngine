# Frontend References

前端结构、组件归属、路由状态、主题 token 与验证入口。

## 什么时候读

- 改 `frontend/src/` 下的页面、组件、样式、路由、状态
- 调整主题 token、前端交互、页面装配方式
- 判断前端相关测试该跑哪一层

本主轴承接的高频跨模块任务片段：

- chat / writing / assistant 的用户可见交互、状态展示、错误提示
- 恢复 / 静默 resume / 流式链路落到页面后的可见行为
- 导入导出、persona/world 编辑等功能落到页面后的入口与交互

## 先读哪几页

0. **[`coding-standards.md`](coding-standards.md)：前端改动必读规范**（CSS token、文件职责、主题分层、组件命名、inline style 禁令、三态、数据边界）
1. [`architecture.md`](architecture.md)：顶层结构、核心入口、assistant 前端接入边界
2. [`pages-and-components.md`](pages-and-components.md)：页面 / domain 组件 / UI 组件归属
3. [`routing-and-state.md`](routing-and-state.md)：路由、共享状态、API 封装边界
4. [`ui-and-theme.md`](ui-and-theme.md)：视觉、token、主题和自定义 CSS 边界
   - [`motion-and-animation.md`](motion-and-animation.md)：动效真源（duration/easing token、framer variants、关键帧、reduced-motion）
5. [`public-and-test-support.md`](public-and-test-support.md)：静态资源、测试 setup、helpers
6. [`testing.md`](testing.md)：前端验证入口

## 高频任务快速分流

- **任何前端改动（必读）**：[`coding-standards.md`](coding-standards.md)
- 改 UI / 样式 / token / 自定义 CSS：读 [`ui-and-theme.md`](ui-and-theme.md)
- 改动效 / 缓动 / 入场动画 / 关键帧：读 [`motion-and-animation.md`](motion-and-animation.md)
- 改页面结构 / 组件归属 / shell：读 [`pages-and-components.md`](pages-and-components.md)
- 改路由 / Zustand / API 封装 / assistant 前端状态：读 [`routing-and-state.md`](routing-and-state.md)
- 改 favicon / logo / 测试 setup / axe：读 [`public-and-test-support.md`](public-and-test-support.md)
- 判断前端测试：读 [`testing.md`](testing.md)

## 真源与非真源

- 真源：`frontend/src/core/`、`frontend/src/pages/`、`frontend/src/components/`、`frontend/src/themes/`、本主轴文档
- 非真源：历史 changelog、旧设计文档名、主题营销文案

## 何时同步

- 前端目录分层、页面壳、状态边界或测试入口变化时
- 新增可复用 UI 约束、主题边界或新的前端落点时
