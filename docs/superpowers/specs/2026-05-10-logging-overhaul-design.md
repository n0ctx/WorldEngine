# 日志补齐与通知体系设计

> 日期：2026-05-10
> 范围：后端 logger 全面优化（覆盖/级别/格式/输出体验）、前端 logger 新建（三通道：toast + console + 上报后端）、印章风通知 UI + 轻弹跳入场动效。

---

## 1. 目标

1. **后端**：在已有 `backend/utils/logger.js` 基础上，补齐覆盖、校准级别、统一格式、提升输出体验。
2. **前端**：从仅有 `pushErrorToast` 扩展为统一 `log` API，支持 debug/info/warn/error 四级，三通道输出（toast 用户可见、console 开发者可见、warn/error 上报后端）。
3. **通知 UI**：印章/签封风视觉，右上角堆叠，轻弹跳入场动效。

---

## 2. 总体架构

```
前端                                            后端
─────────────────────────────────             ──────────────────────────────────
utils/logger.js (新)                           utils/logger.js (优化)
  ├─ debug/info/warn/error  →  console.*       ├─ debug/info/warn/error
  ├─ warn/error  →  toast (除非 silent)        ├─ formatMeta() 强制统一格式
  └─ warn/error  →  上报缓冲队列                 ├─ 文件写入：worldengine-YYYY-MM-DD.log
                              │                 ├─ requestId 透传 (AsyncLocalStorage)
                              ↓                 └─ logger.client.{level} 子 logger
                   POST /api/client-logs ─→  routes/client-logs.js (新)
                   (批量/sendBeacon/重试)         └→ services/client-log-ingest.js
                                                   └→ logger.client.{level}(...)

utils/toast.js (重写为内部出口)
  └─ GlobalToast.jsx (重写：印章风+右上角+轻弹跳)
```

**变更文件清单**

新建：
- `frontend/src/utils/logger.js`
- `frontend/src/components/ui/ToastCard.jsx`
- `backend/routes/client-logs.js`
- `backend/services/client-log-ingest.js`
- `frontend/src/utils/__tests__/logger.test.js`
- `frontend/src/components/ui/__tests__/GlobalToast.test.jsx`
- `backend/tests/routes/client-logs.test.js`

重写：
- `frontend/src/utils/toast.js`（仅供 logger 内部调用，组件不再直接 import）
- `frontend/src/components/ui/GlobalToast.jsx`

改造：
- `backend/utils/logger.js`（formatMeta 加固、requestId 透传、client 子 logger、启动横幅）
- `backend/utils/constants.js`（新增 client-logs 限额）
- `backend/server.js`（挂载 `/api/client-logs` 路由 + requestId 中间件）
- `backend/tests/utils/logger-extra.test.js`（扩展用例）
- 全仓 ~50 处 `pushErrorToast` 调用 → 统一改为 `log.error(event, err, { toast })`
- 全仓后端模块按 §3 表格补齐日志点

文档同步：`SCHEMA.md` 无字段变更（不写）；`ARCHITECTURE.md` 新增 §"日志与通知"；`CHANGELOG.md` 追加一条。

---

## 3. 后端日志改造

### 3.1 覆盖补全（A）

| 模块 | 必须有的日志点 |
|---|---|
| `routes/*` | 入参校验失败 → `warn`；500 异常 → `error`（含 path/method/userMsg） |
| `services/*` | 业务异常 catch → `error`；关键状态变更（session 创建/删除等）→ `info` |
| `db/queries/*` | SQL 异常 → `error`；执行 >200ms 的查询 → `warn`（带 SQL 摘要） |
| `llm/providers/*` | 请求开始 → `debug`；非 200 / 解析失败 → `error`；token 用量 → `info` |
| `memory/*` | 摘要/状态更新成功 → `info`；失败 → `warn`（不阻断主流程） |
| `prompts/assembler.js` | 段位被跳过/字段缺失 → `debug`；条目命中数 → `debug` |
| `utils/async-queue.js` | 任务入队/出队 → `debug`；任务失败 → `warn`；优先级 4/5 被丢弃 → `info` |
| `services/cleanup-registrations.js` | 钩子失败 → `warn`（按现有约束不影响 DELETE） |
| `assistant/server/*` | parent/sub-agent 步骤 → `info`；工具调用失败 → `warn` |

### 3.2 级别校准（B）

- grep 全仓 `console.log` / `console.error` / `console.warn`，按 3.1 表格规则改写或删除
- 高频 `log.info`（每秒级）下调到 `debug`
- 被 `warn` 掩盖的真错误升为 `error`

### 3.3 格式统一（C）

- 所有 `log.*` 调用必须用模板：`log.X(\`<事件名> ${formatMeta({...})}\`)`，禁止裸字符串拼接
- 标准上下文字段（出现就必带）：`sessionId / characterId / worldId / requestId / module`
- `formatMeta` 增强：固定字段顺序、`null/undefined` 自动跳过、字符串值自动 truncate 到 `max_preview_chars`
- 新增 eslint custom rule：禁止 backend 直接 `console.*`（锁定文件 `assembler.js` 等不豁免，统一改为 logger）

### 3.4 输出体验（D）

- **终端**：保留现有颜色 + 图标，行首加 `module` 列对齐到固定宽度（最多 12 字符）
- **文件**：仍按行写，行尾追加 `meta` JSON 段（便于 `jq`），主消息保持人类可读
- **requestId**：在 `routes/*` 入口用中间件生成（`crypto.randomUUID().slice(0,8)`），通过 AsyncLocalStorage 透传到当请求调用栈，所有 logger 自动附带
- **启动横幅**：logger 初始化时打印一行：当前 `LOG_LEVEL` / `LOG_FILE_LEVEL` / `mode` / data dir

### 3.5 client 子 logger

- `logger.client.{level}(event, meta)`：所有上报日志带 `[client]` 前缀，写入同一日 `worldengine-YYYY-MM-DD.log`
- meta 必含 `ua / page / feSession / ts`

---

## 4. 前端日志层

### 4.1 API

```js
import { log } from '@/utils/logger';

log.debug('chat.sse.event', { type: 'token', sessionId });
log.info('character.import.start', { count: 3 });
log.warn('api.fetch.retry', { url, attempt: 2 }, { toast: '网络不稳，正在重试' });
log.error('api.fetch.failed', err, { toast: true });             // 用 err.message 作为 toast 文案
log.error('state.save.failed', err, { toast: '保存失败' });
log.error('background.task.failed', err, { silent: true });      // 仅 console + 上报
```

签名：`log.LEVEL(event: string, payload?: object|Error, opts?: { toast?: boolean|string, silent?: boolean })`
- `event`：点分命名 `<域>.<动作>.<结果>`
- `payload`：对象或 Error；Error 自动抽取 `message/stack/status`
- `opts.toast`：true=用 message 弹、string=用自定义文案弹、缺省=warn/error 默认弹（除非 silent）
- `opts.silent`：完全不弹 toast（仅 console + 上报）

### 4.2 行为表

| level | console | toast | 上报后端 |
|---|---|---|---|
| debug | ✓（dev 才打） | ✗ | ✗ |
| info | ✓ | 仅当 `opts.toast` 显式给出 | ✗ |
| warn | ✓ | 默认弹（除非 silent） | ✓ |
| error | ✓ | 默认弹（除非 silent） | ✓ |

### 4.3 调试开关

- URL `?debug=1` 或 `localStorage['we:log:level']='debug'` → console 开放 debug 级
- 生产默认 console 起 `info` 级

### 4.4 迁移策略

- 现有 ~50 处 `pushErrorToast(err.message || 'xxx失败')` → `log.error('<event>', err, { toast: 'xxx失败' })`
- `utils/toast.js` 重写为 logger 内部出口；组件不得再直接 import `pushErrorToast` 等
- 添加 eslint rule：`frontend/src/components/**` 禁止 import `utils/toast.js`，必须走 `utils/logger.js`

### 4.5 store 集成

不做全局 middleware 拦截。如需观察特定 action，在该 action 内手动 `log.debug`。

---

## 5. 上报缓冲与后端接入

### 5.1 前端缓冲器（`utils/logger.js` 内部）

- **触发条件**（任一满足即 flush）：缓冲达 **20 条** / 距上次 flush **5 秒** / 缓冲含 `error` 级
- **页面卸载兜底**：`visibilitychange→hidden` 和 `pagehide` 用 `navigator.sendBeacon('/api/client-logs', blob)`
- **失败处理**：fetch 失败 → 写 `localStorage['we:log:retry']`（上限 200 条 FIFO）→ 下次启动 + 每次 flush 前合并重发
- **节流保护**：单次 POST 上限 100 条；超量按时间窗最旧的丢弃，记录 `dropped` 计数随下一批上报

### 5.2 上报载荷

```json
{
  "client": { "ua": "...", "page": "/chat/xxx", "session": "fe-uuid", "ts": 1715300000000 },
  "logs": [
    { "level": "error", "event": "api.fetch.failed", "ts": 1715299998000,
      "payload": { "url": "/api/sessions", "status": 500, "message": "..." } }
  ]
}
```

`fe-uuid` = `sessionStorage` 存的浏览器会话 ID（刷新保持，关页失效），用于把同一用户操作串起来。

### 5.3 后端 `routes/client-logs.js`

- 仅 POST，体积上限 256KB，超限 413
- 不需鉴权（本地工具），加 IP 限速：每 IP 每秒 10 次（复用 `utils/network-safety.js` 或新加最小实现）
- 校验：`logs` 数组、每条必有 `level/event/ts`，非法字段静默丢弃
- 转交 `services/client-log-ingest.js` → 按级别调 `logger.client.{level}(event, formatMeta({...payload, page, ua, feSession}))`
- 响应：`{ accepted: N, dropped: M }`，前端只 `log.debug` 不再追加上报

### 5.4 常量与配置

- `backend/utils/constants.js` 新增：
  - `CLIENT_LOG_MAX_BATCH = 100`
  - `CLIENT_LOG_MAX_PAYLOAD_BYTES = 256 * 1024`
  - `CLIENT_LOG_RATE_PER_SEC = 10`
- `data/config.json` 新增 `logging.client = { enabled: true, accept_levels: ['warn','error'] }`，关闭后接口返回 204 不写入

---

## 6. 印章风通知 UI

### 6.1 位置 & 容器

- `fixed top-4 right-4 z-[var(--we-z-toast)]`，垂直堆叠 `gap-3`
- `MAX_TOASTS = 3`，超出时最旧的提前 fade-out
- 移动端 `<640px`：`top-2 left-2 right-2`，全宽卡片

### 6.2 单卡视觉

```
┌────────────────────────────────────────┐
│ ⊕  保存失败                       ✖   │   标题区：图标 + 标题(衬线 14px) + 关闭键
│    network timeout: /api/sessions/xxx  │   正文(无衬线 12.5px ink-secondary)
└────────────────────────────────────────┘
   └─ 4px 左侧色条（按级别取色）
   └─ 背景：var(--we-color-surface-paper)
   └─ 描边：0 0 0 1px var(--we-color-border-subtle)
              + 0 4px 12px rgba(0,0,0,0.08)
   └─ 圆角：var(--we-radius-md)
   └─ 右下角：印章水印（24px svg，opacity 0.18）
```

| 级别 | 色条 token | 图标 | 印章字 |
|---|---|---|---|
| error   | `--we-color-status-danger`  | lucide `x-octagon`     | 驳 |
| warning | `--we-color-status-warning` | lucide `alert-triangle` | 警 |
| info    | `--we-color-status-info`    | lucide `info`          | 录 |
| success | `--we-color-accent`         | lucide `check`         | 成 |

印章字采用衬线，色随级别（error/warn 红橙、info 蓝、success 陶土），不与 `SealStampAnimation` 抢戏（无动画，仅静态水印）。

### 6.3 入场动效

```js
initial:  { opacity: 0, scale: 0.9, y: -8 }
animate:  { opacity: 1, scale: 1,   y: 0  }
transition: { type: 'spring', stiffness: 420, damping: 22, mass: 0.6 }
exit:     { opacity: 0, x: 24,  scale: 0.96, transition: { duration: 0.18 } }
```

出场向右滑出，呼应右上角位置。

### 6.4 交互

- hover：暂停自动消失计时；卡片轻微 `scale 1.01` + 阴影加深一档
- 关闭键 ✖：始终显示在右上角，点击立即 exit；`aria-label="关闭通知"`
- 自动消失：error/warn = **5000ms**，info/success = **3000ms**
- 同消息 `DEDUP_MS = 1500ms` 去重保留
- 卡片正文区不可点击跳转

### 6.5 可访问性

- 容器 `role="region" aria-live="polite" aria-label="通知"`
- error 级单独用 `aria-live="assertive"`
- `prefers-reduced-motion` 下：去掉 spring 弹跳，改 200ms fade

### 6.6 组件结构

```
GlobalToast.jsx (重写)
  ├─ ToastStack       容器 + 监听 we:toast 事件 + 状态管理
  └─ ToastCard        单卡渲染（受控传入 toast 对象）
```

`ToastCard` 抽出便于将来在嵌入式通知场景复用，但本次不强制。

需在 `frontend/src/components/index.js` 注册新组件 `ToastCard`。

---

## 7. 测试与验证

### 7.1 自动化测试

- **后端**
  - 扩展 `backend/tests/utils/logger-extra.test.js`：`formatMeta` 新行为、`requestId` 透传、`client` 子 logger 写入
  - 新增 `backend/tests/routes/client-logs.test.js`：批量接收 / 限速 / 体积超限 / 非法 payload 静默丢弃
- **前端**
  - 新增 `frontend/src/utils/__tests__/logger.test.js`：buffer flush 触发条件 / sendBeacon 兜底 / localStorage 重试 / dedupe
  - 新增 `frontend/src/components/ui/__tests__/GlobalToast.test.jsx`：入场动画、hover pause、关闭按钮、reduced-motion 退化

### 7.2 人工验证

1. 启动前后端，把 `/api/sessions` DELETE 临时改为抛错，前端点删除会话 → 看到右上印章卡 + console error + 5s 后 backend log 出现 `[client] error api.fetch.failed`
2. 关闭浏览器标签 → backend log 应有页面卸载前的待发日志（sendBeacon 兜底）
3. 系统设置开启 `prefers-reduced-motion` → 验证退化为 fade
4. 故意触发 200ms+ 慢查询 → backend log 出现 `warn db.query.slow`
5. 故意 500ms 内连发 3 次同 message → 通知去重生效，只显示 1 张

---

## 8. 文档同步

- `ARCHITECTURE.md` 新增"日志与通知"段：说明前后端 logger API、上报链路、UI 行为
- `CHANGELOG.md` 追加：日志体系重构（覆盖补全/级别校准/格式统一/输出体验/前端三通道/印章风通知）
- `CLAUDE.md`：在"前端"约束段追加"组件不得直接 import `utils/toast.js`，所有日志/通知必须经 `utils/logger.js`"
- `SCHEMA.md`：无字段变更，不修改

---

## 9. 不在本次范围

- 不引入第三方日志聚合服务（Sentry / Logtail 等）
- 不做日志查询/检索 UI（继续靠文件 + grep / jq）
- 不做服务端→客户端的反向通知通道（如 SSE 推 toast）
- store 不接入全局 middleware 拦截
