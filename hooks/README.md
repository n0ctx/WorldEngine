# WorldEngine Hook 系统

`hooks/` 目录是用户 DIY 的接入点。将 `.js` 文件放在此目录（根层，不含子目录），系统启动时自动按文件名字母序加载。

## 文件格式

每个 hook 文件必须有一个**默认导出函数**，接收 `{ registerHook }` 参数：

```js
export default function register({ registerHook }) {
  registerHook('事件名', async (payload) => {
    // 处理逻辑
  }, { label: '可选日志标签' });
}
```

- 同一事件可注册多次，按注册顺序串行执行
- 单个 hook 抛错只记录警告，不中断后续 hook，不影响主流程
- 文件名以数字开头可控制加载顺序，如 `01-my-hook.js`

## 完整事件清单

| 事件 | 触发时机 | payload 字段 |
|------|---------|-------------|
| `generation:post` | LLM 生成完毕，任务入队前 | `sessionId`, `worldId`, `taskSpecs[]`, `mode` |
| `message:user:before` | 用户消息保存前 | `sessionId`, `content`, `attachments` |
| `message:user:saved` | 用户消息保存后 | `message`, `sessionId` |
| `message:assistant:saved` | AI 消息保存后 | `message`, `sessionId`, `aborted` |
| `message:deleted` | 消息删除后 | `id`, `sessionId` |
| `message:edited` | 消息内容更新后 | `id`, `sessionId`, `content` |
| `queue:task:start` | 队列任务开始执行 | `sessionId`, `label`, `priority` |
| `queue:task:done` | 队列任务成功完成 | `sessionId`, `label`, `priority`, `ms` |
| `queue:task:fail` | 队列任务执行失败 | `sessionId`, `label`, `priority`, `error` |

## generation:post：注入自定义任务

`generation:post` 的 `taskSpecs` 是数组引用，可直接 `push` 新任务，复用现有优先级队列、SSE 推送等全部能力：

```js
registerHook('generation:post', async ({ sessionId, taskSpecs, mode }) => {
  taskSpecs.push({
    label: 'my-task',
    priority: 5,           // 数字越小优先级越高（内置最低为 4，自定义建议 5）
    fn: async () => { /* 自定义逻辑 */ },
    keepSseAlive: false,   // true 时阻止 SSE 连接关闭，等待推送 sseEvent
    // sseEvent: 'my_event',
    // ssePayload: (result) => ({ type: 'my_event', result }),
    // condition: true,    // false 时跳过
    // tracksState: false, // 注册为状态更新追踪（state 任务专用）
  });
});
```

内置任务 label 参考：`title` / `all-state` / `turn-record` / `diary` / `session-title` / `chapter-title`

## 访问内部模块

在 hook 文件中可直接 `import` 项目内部模块：

```js
import { getSessionById } from '../backend/services/sessions.js';
import { createLogger } from '../backend/utils/logger.js';
```

路径相对于 hook 文件自身（`hooks/` 目录位于项目根目录）。

## 示例文件

`examples/` 目录下有三个示例文件（不会被自动加载，仅供参考）：

- `inject-post-gen-task.example.js` — 向生成后队列注入自定义任务
- `on-message-saved.example.js` — 监听消息生命周期事件
- `on-queue-task-event.example.js` — 监听队列任务事件

将示例复制到 `hooks/` 根目录并重命名（去掉 `.example`）即可激活。
