# 日志补齐与通知体系 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 后端 logger 全面优化（覆盖/级别/格式/输出体验）；前端新增统一 `log` API（toast/console/上报后端三通道）；通知 UI 重写为印章风、右上角堆叠、轻弹跳入场。

**Architecture:** 复用 `backend/utils/logger.js` 框架，新增 `client` 子 logger + `requestId` AsyncLocalStorage 中间件。新增 `POST /api/client-logs` 接收前端批量日志，写入同一日志文件并加 `[client]` 前缀。前端新建 `utils/logger.js`（dedupe/buffer/sendBeacon/localStorage 重试），所有现有 `pushErrorToast` 调用统一迁移；`GlobalToast.jsx` 重写为印章风 `ToastCard`。

**Tech Stack:** Node.js + Express（AsyncLocalStorage 透传 requestId） / better-sqlite3 / vitest（前后端单测） / React 19 + framer-motion（弹跳/出场动画） / TailwindCSS + 现有 `--we-*` token / lucide-react 图标。

**参考 spec：** `docs/superpowers/specs/2026-05-10-logging-overhaul-design.md`

---

## File Structure

**新建**
- `backend/utils/request-context.js` — AsyncLocalStorage 包装、requestId 生成与读取
- `backend/middleware/request-id.js` — Express 中间件，挂在所有路由前
- `backend/services/client-log-ingest.js` — 接收前端日志批，按级别转交 logger.client
- `backend/routes/client-logs.js` — POST /api/client-logs 路由
- `backend/tests/utils/request-context.test.js`
- `backend/tests/services/client-log-ingest.test.js`
- `backend/tests/routes/client-logs.test.js`
- `frontend/src/utils/logger.js` — 统一 log API + 缓冲 + 上报
- `frontend/src/utils/__tests__/logger.test.js`
- `frontend/src/components/ui/ToastCard.jsx` — 单条印章卡
- `frontend/src/components/ui/__tests__/GlobalToast.test.jsx`
- `eslint-rules/no-direct-toast-import.js` — 自定义 lint 规则
- `eslint-rules/no-backend-console.js` — 自定义 lint 规则

**改造**
- `backend/utils/logger.js` — `formatMeta` 强化、`createLogger` 注入 requestId、新增 `clientLogger`、启动横幅
- `backend/utils/constants.js` — 新增 client-logs 限额常量
- `backend/server.js` — 挂载 requestId 中间件 + client-logs 路由 + 启动横幅
- `frontend/src/utils/toast.js` — 改为 logger 内部出口
- `frontend/src/components/ui/GlobalToast.jsx` — 重写为印章风
- `frontend/src/components/index.js` — 注册 ToastCard
- `eslint.config.js`（前/后端）— 启用自定义规则
- 全仓 ~50 处 `pushErrorToast` 调用（迁移到 `log.error`）
- 后端按 §3 表格补齐日志点（routes/services/db/queries/llm/memory/prompts/utils/assistant）

**文档**
- `ARCHITECTURE.md` — 新增"日志与通知"段
- `CHANGELOG.md` — 追加一条
- `CLAUDE.md` — 在前端约束追加"组件不得直接 import utils/toast.js"

---

## 阶段拆分

| 阶段 | 内容 | 任务编号 |
|---|---|---|
| 1 | 后端 logger 基础设施加固 | 1–4 |
| 2 | 后端 client-logs 接入 | 5–7 |
| 3 | 前端 logger 核心 | 8–10 |
| 4 | 通知 UI 重写 | 11–14 |
| 5 | 前端调用点迁移 + lint 守门 | 15–17 |
| 6 | 后端覆盖补全 + 级别校准 + lint | 18–24 |
| 7 | 文档 + 端到端验证 | 25–26 |

---

# 阶段 1 — 后端 logger 基础设施

### Task 1: formatMeta 强化（固定字段顺序 + truncate）

**Files:**
- Modify: `backend/utils/logger.js:261-272`
- Test: `backend/tests/utils/logger-extra.test.js`

- [ ] **Step 1: Write failing tests**

追加到 `backend/tests/utils/logger-extra.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { formatMeta } from '../../utils/logger.js';

describe('formatMeta — 强化行为', () => {
  it('保留固定字段顺序：requestId → sessionId → characterId → worldId → module → 其他', () => {
    const out = formatMeta({ foo: 1, sessionId: 's1', module: 'mem', requestId: 'r1', worldId: 'w1', characterId: 'c1' });
    expect(out).toBe('requestId="r1"  sessionId="s1"  characterId="c1"  worldId="w1"  module="mem"  foo=1');
  });

  it('null 与 undefined 都被跳过', () => {
    const out = formatMeta({ a: null, b: undefined, c: 1 });
    expect(out).toBe('c=1');
  });

  it('字符串值超长按 max_preview_chars 截断（默认 600）', () => {
    const long = 'x'.repeat(800);
    const out = formatMeta({ msg: long });
    expect(out).toContain('SNIP');
    expect(out.length).toBeLessThan(800);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `cd backend && npx vitest run tests/utils/logger-extra.test.js -t "强化行为"`
Expected: 3 个用例 FAIL（顺序错、null 未跳过、字符串未截断）

- [ ] **Step 3: 实现 formatMeta 强化**

替换 `backend/utils/logger.js:261-272` 为：

```js
const META_KEY_ORDER = ['requestId', 'sessionId', 'characterId', 'worldId', 'module'];

export function formatMeta(meta = {}) {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null);
  entries.sort(([a], [b]) => {
    const ai = META_KEY_ORDER.indexOf(a);
    const bi = META_KEY_ORDER.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
  return entries
    .map(([key, value]) => {
      if (typeof value === 'string') return `${key}=${JSON.stringify(previewText(value))}`;
      if (Array.isArray(value)) return `${key}=${previewJson(value)}`;
      if (typeof value === 'object') return `${key}=${previewJson(value)}`;
      return `${key}=${String(value)}`;
    })
    .join('  ');
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `cd backend && npx vitest run tests/utils/logger-extra.test.js -t "强化行为"`
Expected: 3 PASS

- [ ] **Step 5: 跑全量后端单测，确认未破坏既有行为**

Run: `cd backend && npm test`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add backend/utils/logger.js backend/tests/utils/logger-extra.test.js
git commit -m "feat(logger): formatMeta 字段顺序 + null 跳过 + 字符串截断"
```

---

### Task 2: requestId AsyncLocalStorage + 中间件

**Files:**
- Create: `backend/utils/request-context.js`
- Create: `backend/middleware/request-id.js`
- Test: `backend/tests/utils/request-context.test.js`

- [ ] **Step 1: 写失败测试**

`backend/tests/utils/request-context.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { runWithContext, getRequestId } from '../../utils/request-context.js';

describe('request-context', () => {
  it('runWithContext 内可读取 requestId', () => {
    runWithContext({ requestId: 'rid-123' }, () => {
      expect(getRequestId()).toBe('rid-123');
    });
  });

  it('上下文外读取返回 undefined', () => {
    expect(getRequestId()).toBeUndefined();
  });

  it('嵌套上下文不互相污染', () => {
    runWithContext({ requestId: 'outer' }, () => {
      runWithContext({ requestId: 'inner' }, () => {
        expect(getRequestId()).toBe('inner');
      });
      expect(getRequestId()).toBe('outer');
    });
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx vitest run tests/utils/request-context.test.js`
Expected: FAIL — 找不到模块

- [ ] **Step 3: 实现 request-context.js**

```js
// backend/utils/request-context.js
import { AsyncLocalStorage } from 'node:async_hooks';

const _als = new AsyncLocalStorage();

export function runWithContext(ctx, fn) {
  return _als.run(ctx, fn);
}

export function getRequestId() {
  return _als.getStore()?.requestId;
}

export function getContext() {
  return _als.getStore() ?? {};
}
```

- [ ] **Step 4: 运行测试通过**

Run: `cd backend && npx vitest run tests/utils/request-context.test.js`
Expected: 3 PASS

- [ ] **Step 5: 实现中间件**

```js
// backend/middleware/request-id.js
import crypto from 'node:crypto';
import { runWithContext } from '../utils/request-context.js';

export function requestIdMiddleware(req, res, next) {
  const requestId = crypto.randomUUID().slice(0, 8);
  res.setHeader('x-request-id', requestId);
  runWithContext({ requestId }, () => next());
}
```

- [ ] **Step 6: Commit**

```bash
git add backend/utils/request-context.js backend/middleware/request-id.js backend/tests/utils/request-context.test.js
git commit -m "feat(logger): AsyncLocalStorage 透传 requestId 上下文"
```

---

### Task 3: createLogger 自动附带 requestId + 启动横幅

**Files:**
- Modify: `backend/utils/logger.js:284-316`
- Test: `backend/tests/utils/logger-extra.test.js`

- [ ] **Step 1: 写失败测试**

追加到 `backend/tests/utils/logger-extra.test.js`：

```js
import { runWithContext } from '../../utils/request-context.js';
import { createLogger } from '../../utils/logger.js';

describe('createLogger — requestId 自动注入', () => {
  it('在 runWithContext 内调用 logger，输出含 requestId="xxx"', () => {
    const logs = [];
    const origInfo = console.log;
    console.log = (line) => logs.push(line);
    try {
      runWithContext({ requestId: 'rid-abc' }, () => {
        const log = createLogger('test', 'cyan');
        log.info(`hello ${''}`); // 空 meta，但应自动追加 requestId
      });
    } finally {
      console.log = origInfo;
    }
    expect(logs.some(l => l.includes('requestId="rid-abc"'))).toBe(true);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx vitest run tests/utils/logger-extra.test.js -t "requestId 自动注入"`
Expected: FAIL

- [ ] **Step 3: 改造 write() 自动注入**

修改 `backend/utils/logger.js`：

```js
// 顶部 import 区追加：
import { getRequestId } from './request-context.js';

// 替换 write() 函数（约 284 行起）：
function write(level, tag, tagColor, args) {
  const lc = C[level];
  const tc = C[tagColor] ?? C.bold;
  const icon = LEVEL_ICON[level];
  const ts = `${C.dim}${timestamp()}${C.reset}`;
  const lvl = `${lc}${level.toUpperCase().padEnd(5)}${C.reset}`;
  const tagPad = (tag ?? '').padEnd(12);  // 12 字符对齐
  const tagStr = `${tc}[${tagPad}]${C.reset}`;
  const requestId = getRequestId();
  const ridStr = requestId ? `${C.dim}rid=${requestId}${C.reset} ` : '';
  const msg = args.map(formatArg).join(' ');
  const colorLine = `${ts} ${lvl} ${tagStr} ${lc}${icon}${C.reset} ${ridStr}${msg}`;
  const plainLine = `${timestamp()} ${level.toUpperCase().padEnd(5)} [${tagPad}] ${icon} ${requestId ? `rid=${requestId} ` : ''}${msg}`;

  if (LEVEL_ORDER[level] >= currentLevel) {
    if (_spinnerActive) _clearSpinnerLine();
    if (level === 'error') console.error(colorLine);
    else if (level === 'warn') console.warn(colorLine);
    else console.log(colorLine);
  }
  writeToFile(stripAnsi(plainLine), level);
}
```

- [ ] **Step 4: 运行测试通过**

Run: `cd backend && npx vitest run tests/utils/logger-extra.test.js`
Expected: 全部 PASS

- [ ] **Step 5: 添加启动横幅函数**

在 `backend/utils/logger.js` 末尾追加：

```js
export function logBootBanner({ dataDir }) {
  const log = createLogger('boot', 'green');
  const cfg = getLoggingConfig();
  log.info(`logger ready ${formatMeta({
    LOG_LEVEL: Object.keys(LEVEL_ORDER).find(k => LEVEL_ORDER[k] === currentLevel),
    LOG_FILE_LEVEL: Object.keys(LEVEL_ORDER).find(k => LEVEL_ORDER[k] === fileLogLevel),
    mode: cfg.mode,
    dataDir,
  })}`);
}
```

- [ ] **Step 6: 在 server.js 启动时调用横幅 + 挂载中间件**

修改 `backend/server.js`：
- 顶部 import 追加：`import { requestIdMiddleware } from './middleware/request-id.js';` 和 `import { logBootBanner } from './utils/logger.js';`
- 在 `app.use(express.json(...))` 之前插入：`app.use(requestIdMiddleware);`
- 在 `app.listen(...)` 回调内调用：`logBootBanner({ dataDir: DATA_ROOT });`

- [ ] **Step 7: 跑后端单测 + 手工启动后端 dev**

Run: `cd backend && npm test`
Expected: 全部 PASS

Run: `cd backend && npm run dev`
Expected: 启动日志包含一行 `boot ◆ logger ready  LOG_LEVEL="warn"  LOG_FILE_LEVEL="info"  mode="metadata"  dataDir="..."`；用 `curl -i http://localhost:3000/api/config` 应返回 `x-request-id` 响应头。

- [ ] **Step 8: Commit**

```bash
git add backend/utils/logger.js backend/server.js backend/tests/utils/logger-extra.test.js
git commit -m "feat(logger): requestId 自动注入 + 启动横幅 + tag 列对齐 12 字符"
```

---

### Task 4: client-logs 限额常量

**Files:**
- Modify: `backend/utils/constants.js`

- [ ] **Step 1: 追加常量**

在 `backend/utils/constants.js` 末尾追加：

```js
// ============================
// 前端日志上报（client-logs）
// ============================
/** 单次 POST 最大日志条数 */
export const CLIENT_LOG_MAX_BATCH = 100;
/** 单次 POST 体积上限（256KB） */
export const CLIENT_LOG_MAX_PAYLOAD_BYTES = 256 * 1024;
/** 每 IP 每秒上报次数上限 */
export const CLIENT_LOG_RATE_PER_SEC = 10;
```

- [ ] **Step 2: Commit**

```bash
git add backend/utils/constants.js
git commit -m "chore(constants): 新增 client-logs 限额常量"
```

---

# 阶段 2 — 后端 client-logs 接入

### Task 5: client-log-ingest 服务（按级别转交 logger.client）

**Files:**
- Create: `backend/services/client-log-ingest.js`
- Test: `backend/tests/services/client-log-ingest.test.js`
- Modify: `backend/utils/logger.js`（新增 `clientLogger` 导出）

- [ ] **Step 1: 写失败测试**

```js
// backend/tests/services/client-log-ingest.test.js
import { describe, it, expect, vi } from 'vitest';
import { ingestClientLogs } from '../../services/client-log-ingest.js';
import * as loggerMod from '../../utils/logger.js';

describe('client-log-ingest', () => {
  it('按 level 调用对应的 clientLogger 方法', () => {
    const calls = [];
    const fakeLogger = {
      debug: (...a) => calls.push(['debug', ...a]),
      info:  (...a) => calls.push(['info', ...a]),
      warn:  (...a) => calls.push(['warn', ...a]),
      error: (...a) => calls.push(['error', ...a]),
    };
    vi.spyOn(loggerMod, 'getClientLogger').mockReturnValue(fakeLogger);

    ingestClientLogs({
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [
        { level: 'error', event: 'a.b.c', ts: 1, payload: { foo: 1 } },
        { level: 'warn',  event: 'd.e.f', ts: 2, payload: { bar: 2 } },
      ],
    });

    expect(calls.map(c => c[0])).toEqual(['error', 'warn']);
    expect(calls[0][1]).toContain('a.b.c');
    expect(calls[0][1]).toContain('page="/x"');
  });

  it('非法 level 静默丢弃', () => {
    const result = ingestClientLogs({
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [{ level: 'fatal', event: 'x', ts: 1 }],
    });
    expect(result.accepted).toBe(0);
    expect(result.dropped).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx vitest run tests/services/client-log-ingest.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 在 logger.js 末尾追加 getClientLogger**

```js
let _clientLogger = null;
export function getClientLogger() {
  if (!_clientLogger) _clientLogger = createLogger('[client]', 'magenta');
  return _clientLogger;
}
```

- [ ] **Step 4: 实现 ingest 服务**

```js
// backend/services/client-log-ingest.js
import { getClientLogger, formatMeta } from '../utils/logger.js';

const ALLOWED_LEVELS = new Set(['debug', 'info', 'warn', 'error']);

export function ingestClientLogs(body) {
  const { client = {}, logs = [] } = body || {};
  const log = getClientLogger();
  let accepted = 0;
  let dropped = 0;

  for (const entry of logs) {
    if (!entry || !ALLOWED_LEVELS.has(entry.level) || !entry.event) {
      dropped += 1;
      continue;
    }
    const meta = formatMeta({
      page: client.page,
      ua: client.ua,
      feSession: client.session,
      ts: entry.ts,
      ...entry.payload,
    });
    log[entry.level](`${entry.event} ${meta}`);
    accepted += 1;
  }
  return { accepted, dropped };
}
```

- [ ] **Step 5: 运行测试通过**

Run: `cd backend && npx vitest run tests/services/client-log-ingest.test.js`
Expected: 2 PASS

- [ ] **Step 6: Commit**

```bash
git add backend/utils/logger.js backend/services/client-log-ingest.js backend/tests/services/client-log-ingest.test.js
git commit -m "feat(logger): client 子 logger + ingest 服务"
```

---

### Task 6: client-logs 路由（验证 + 限速 + 体积）

**Files:**
- Create: `backend/routes/client-logs.js`
- Test: `backend/tests/routes/client-logs.test.js`

- [ ] **Step 1: 写失败测试**

```js
// backend/tests/routes/client-logs.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import clientLogsRoutes from '../../routes/client-logs.js';

function makeApp() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));
  app.use('/api/client-logs', clientLogsRoutes);
  return app;
}

describe('POST /api/client-logs', () => {
  it('200 返回 accepted/dropped', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/client-logs').send({
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [{ level: 'error', event: 'a.b', ts: 1 }],
    });
    expect(res.status).toBe(200);
    expect(res.body.accepted).toBe(1);
    expect(res.body.dropped).toBe(0);
  });

  it('413 当 payload 过大', async () => {
    const app = makeApp();
    const big = 'x'.repeat(300 * 1024);
    const res = await request(app).post('/api/client-logs').send({
      client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 },
      logs: [{ level: 'error', event: 'a.b', ts: 1, payload: { big } }],
    });
    expect(res.status).toBe(413);
  });

  it('400 当 logs 不是数组', async () => {
    const app = makeApp();
    const res = await request(app).post('/api/client-logs').send({ logs: 'oops' });
    expect(res.status).toBe(400);
  });

  it('429 当短时间高频调用', async () => {
    const app = makeApp();
    const payload = { client: { ua: 'UA', page: '/x', session: 'fe1', ts: 1 }, logs: [] };
    let lastStatus = 200;
    for (let i = 0; i < 20; i += 1) {
      const r = await request(app).post('/api/client-logs').send(payload);
      lastStatus = r.status;
    }
    expect(lastStatus).toBe(429);
  });
});
```

> 若 `supertest` 未安装：先 `cd backend && npm i -D supertest`，再追加到 devDependencies。

- [ ] **Step 2: 运行确认失败**

Run: `cd backend && npx vitest run tests/routes/client-logs.test.js`
Expected: FAIL（路由不存在）

- [ ] **Step 3: 实现路由**

```js
// backend/routes/client-logs.js
import express from 'express';
import { ingestClientLogs } from '../services/client-log-ingest.js';
import {
  CLIENT_LOG_MAX_BATCH,
  CLIENT_LOG_MAX_PAYLOAD_BYTES,
  CLIENT_LOG_RATE_PER_SEC,
} from '../utils/constants.js';

const router = express.Router();

const _hits = new Map(); // ip -> [{ ts }]

function rateLimit(ip) {
  const now = Date.now();
  const list = (_hits.get(ip) || []).filter(t => now - t < 1000);
  if (list.length >= CLIENT_LOG_RATE_PER_SEC) {
    _hits.set(ip, list);
    return false;
  }
  list.push(now);
  _hits.set(ip, list);
  return true;
}

router.post('/', express.json({ limit: CLIENT_LOG_MAX_PAYLOAD_BYTES }), (req, res, next) => {
  // express.json 的 limit 触发 entity.too.large 错误
  next();
}, (req, res) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (!rateLimit(ip)) return res.status(429).json({ error: 'rate_limited' });

  const body = req.body || {};
  if (!Array.isArray(body.logs)) return res.status(400).json({ error: 'logs must be array' });
  if (body.logs.length > CLIENT_LOG_MAX_BATCH) {
    body.logs = body.logs.slice(0, CLIENT_LOG_MAX_BATCH);
  }
  const result = ingestClientLogs(body);
  res.json(result);
});

// express.json limit 触发的 PayloadTooLargeError 转 413
router.use((err, req, res, _next) => {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
  res.status(500).json({ error: 'internal' });
});

export default router;
```

- [ ] **Step 4: 运行测试通过**

Run: `cd backend && npx vitest run tests/routes/client-logs.test.js`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add backend/routes/client-logs.js backend/tests/routes/client-logs.test.js backend/package.json backend/package-lock.json
git commit -m "feat(api): POST /api/client-logs 路由（验证/限速/体积/批量）"
```

---

### Task 7: 在 server.js 挂载路由

**Files:**
- Modify: `backend/server.js`

- [ ] **Step 1: 挂载路由**

在 `backend/server.js` 顶部 import 区追加：

```js
import clientLogsRoutes from './routes/client-logs.js';
```

在其他 `app.use('/api/...', ...)` 行附近追加：

```js
app.use('/api/client-logs', clientLogsRoutes);
```

- [ ] **Step 2: 手工验证**

Run: `cd backend && npm run dev`
另起终端：

```bash
curl -X POST http://localhost:3000/api/client-logs \
  -H 'Content-Type: application/json' \
  -d '{"client":{"ua":"curl","page":"/test","session":"fe-x","ts":1},"logs":[{"level":"error","event":"manual.test","ts":1,"payload":{"foo":1}}]}'
```

Expected: `{"accepted":1,"dropped":0}`；当日 `data/logs/worldengine-YYYY-MM-DD.log` 末尾出现一行 `[client] ERROR ... manual.test ... page="/test" ua="curl" feSession="fe-x"`。

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(api): 挂载 /api/client-logs 路由"
```

---

# 阶段 3 — 前端 logger 核心

### Task 8: utils/logger.js 核心 API（4 级 + console + dedupe + toast 派发）

**Files:**
- Create: `frontend/src/utils/logger.js`
- Test: `frontend/src/utils/__tests__/logger.test.js`

- [ ] **Step 1: 写失败测试**

```js
// frontend/src/utils/__tests__/logger.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { log, __resetLoggerForTest } from '../logger.js';

describe('frontend logger — 基础 API', () => {
  beforeEach(() => { __resetLoggerForTest(); });

  it('log.error 默认派发 we:toast 事件（type=error）', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.error('api.fetch.failed', new Error('boom'), { toast: true });
    expect(handler).toHaveBeenCalled();
    const evt = handler.mock.calls[0][0];
    expect(evt.detail.type).toBe('error');
    expect(evt.detail.message).toBe('boom');
    window.removeEventListener('we:toast', handler);
  });

  it('opts.silent=true 不派发 toast', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.error('a.b', new Error('x'), { silent: true });
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('we:toast', handler);
  });

  it('log.info 默认不派发 toast', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.info('a.b', { foo: 1 });
    expect(handler).not.toHaveBeenCalled();
    window.removeEventListener('we:toast', handler);
  });

  it('log.warn 自定义 toast 字符串', () => {
    const handler = vi.fn();
    window.addEventListener('we:toast', handler);
    log.warn('api.retry', { attempt: 2 }, { toast: '重试中' });
    expect(handler.mock.calls[0][0].detail.message).toBe('重试中');
    expect(handler.mock.calls[0][0].detail.type).toBe('warning');
    window.removeEventListener('we:toast', handler);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/utils/__tests__/logger.test.js`
Expected: FAIL

- [ ] **Step 3: 实现 logger 核心**

```js
// frontend/src/utils/logger.js
const LEVELS = ['debug', 'info', 'warn', 'error'];
const LEVEL_ORDER = { debug: 0, info: 1, warn: 2, error: 3 };

const TOAST_TYPE = { error: 'error', warn: 'warning', info: 'info', success: 'success' };

let consoleLevel = (() => {
  const fromUrl = new URLSearchParams(globalThis.location?.search || '').get('debug');
  if (fromUrl === '1') return 'debug';
  const ls = globalThis.localStorage?.getItem('we:log:level');
  if (ls && LEVEL_ORDER[ls] !== undefined) return ls;
  return import.meta.env?.DEV ? 'debug' : 'info';
})();

let _buffer = []; // for upload (warn/error)
let _dedupe = new Map();
const DEDUP_MS = 1500;

function dedupeKey(level, event, msg) { return `${level}|${event}|${msg}`; }

function extractError(payload) {
  if (payload instanceof Error) {
    return { message: payload.message, stack: payload.stack, status: payload.status };
  }
  return payload || {};
}

function emitToast(message, type) {
  if (!message) return;
  window.dispatchEvent(new CustomEvent('we:toast', { detail: { message, type } }));
}

function emitConsole(level, event, payload) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[consoleLevel]) return;
  const fn = console[level] || console.log;
  fn(`[${event}]`, payload);
}

function shouldDefaultToast(level) { return level === 'warn' || level === 'error'; }

function shouldUpload(level) { return level === 'warn' || level === 'error'; }

function makeLog(level) {
  return (event, payload, opts = {}) => {
    const data = extractError(payload);
    emitConsole(level, event, data);

    // toast
    let toastMsg = null;
    let toastType = TOAST_TYPE[level === 'warn' ? 'warn' : level];
    if (toastType === undefined) toastType = 'info';
    if (typeof opts.toast === 'string') toastMsg = opts.toast;
    else if (opts.toast === true) toastMsg = data.message || event;
    else if (shouldDefaultToast(level) && !opts.silent) toastMsg = data.message || event;

    if (toastMsg) {
      const key = dedupeKey(level, event, toastMsg);
      const last = _dedupe.get(key) || 0;
      if (Date.now() - last >= DEDUP_MS) {
        _dedupe.set(key, Date.now());
        emitToast(toastMsg, toastType);
      }
    }

    // upload (Task 9 接入实际 flush)
    if (shouldUpload(level)) {
      _buffer.push({ level, event, ts: Date.now(), payload: data });
      _maybeFlush();
    }
  };
}

let _maybeFlush = () => {}; // Task 9 注入

export function __setFlush(fn) { _maybeFlush = fn; }
export function __getBuffer() { return _buffer; }
export function __resetLoggerForTest() {
  _buffer = []; _dedupe = new Map(); _maybeFlush = () => {};
}

export const log = {
  debug: makeLog('debug'),
  info: makeLog('info'),
  warn: makeLog('warn'),
  error: makeLog('error'),
};
```

- [ ] **Step 4: 运行测试通过**

Run: `cd frontend && npx vitest run src/utils/__tests__/logger.test.js`
Expected: 4 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/logger.js frontend/src/utils/__tests__/logger.test.js
git commit -m "feat(frontend-logger): 4 级 API + console + toast 派发 + dedupe"
```

---

### Task 9: 缓冲 + flush + sendBeacon + localStorage 重试

**Files:**
- Modify: `frontend/src/utils/logger.js`
- Test: `frontend/src/utils/__tests__/logger.test.js`

- [ ] **Step 1: 写失败测试（追加到同文件）**

```js
describe('frontend logger — 上报缓冲', () => {
  beforeEach(() => {
    __resetLoggerForTest();
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => ({ accepted: 1, dropped: 0 }) });
    localStorage.removeItem('we:log:retry');
  });
  afterEach(() => { vi.useRealTimers(); });

  it('error 入队后立即触发 flush', async () => {
    log.error('a.b', new Error('x'), { silent: true });
    await Promise.resolve(); await Promise.resolve();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/client-logs', expect.objectContaining({ method: 'POST' }));
  });

  it('达到 20 条 warn 触发 flush', async () => {
    for (let i = 0; i < 19; i += 1) log.warn(`evt.${i}`, { i }, { silent: true });
    expect(globalThis.fetch).not.toHaveBeenCalled();
    log.warn('evt.20', { i: 20 }, { silent: true });
    await Promise.resolve(); await Promise.resolve();
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it('fetch 失败时写入 localStorage 重试队列', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('network'));
    log.error('a.b', new Error('x'), { silent: true });
    await Promise.resolve(); await Promise.resolve();
    const stored = JSON.parse(localStorage.getItem('we:log:retry') || '[]');
    expect(stored.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/utils/__tests__/logger.test.js -t "上报缓冲"`
Expected: FAIL

- [ ] **Step 3: 实现 flush 机制**

在 `frontend/src/utils/logger.js` 末尾追加（替换 `let _maybeFlush = () => {};` 这一行起的占位实现）：

```js
const FLUSH_BATCH = 20;
const FLUSH_INTERVAL_MS = 5000;
const BUFFER_CAP = 500;
const RETRY_KEY = 'we:log:retry';
const RETRY_CAP = 200;
const POST_BATCH_MAX = 100;

let _flushTimer = null;
let _droppedCount = 0;
let _feSessionId = null;

function feSession() {
  if (_feSessionId) return _feSessionId;
  try {
    let id = sessionStorage.getItem('we:log:session');
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem('we:log:session', id); }
    _feSessionId = id;
  } catch { _feSessionId = crypto.randomUUID(); }
  return _feSessionId;
}

function loadRetry() {
  try { return JSON.parse(localStorage.getItem(RETRY_KEY) || '[]'); } catch { return []; }
}
function saveRetry(arr) {
  try { localStorage.setItem(RETRY_KEY, JSON.stringify(arr.slice(-RETRY_CAP))); } catch { /* ignore */ }
}

function clientMeta() {
  return {
    ua: navigator.userAgent,
    page: location.pathname + location.search,
    session: feSession(),
    ts: Date.now(),
  };
}

async function doFlush({ useBeacon = false } = {}) {
  if (_buffer.length === 0 && loadRetry().length === 0) return;
  const merged = [...loadRetry(), ..._buffer].slice(-POST_BATCH_MAX);
  _buffer = [];
  saveRetry([]);

  const body = { client: { ...clientMeta(), dropped: _droppedCount }, logs: merged };
  _droppedCount = 0;
  const json = JSON.stringify(body);

  if (useBeacon && navigator.sendBeacon) {
    try { navigator.sendBeacon('/api/client-logs', new Blob([json], { type: 'application/json' })); } catch { /* ignore */ }
    return;
  }
  try {
    await fetch('/api/client-logs', { method: 'POST', headers: { 'content-type': 'application/json' }, body: json, keepalive: true });
  } catch {
    saveRetry([...loadRetry(), ...merged]);
  }
}

function scheduleFlush() {
  if (_flushTimer) return;
  _flushTimer = setTimeout(() => { _flushTimer = null; doFlush(); }, FLUSH_INTERVAL_MS);
}

__setFlush(() => {
  if (_buffer.length > BUFFER_CAP) {
    _droppedCount += _buffer.length - BUFFER_CAP;
    _buffer = _buffer.slice(-BUFFER_CAP);
  }
  if (_buffer.length >= FLUSH_BATCH) { doFlush(); return; }
  if (_buffer.some(e => e.level === 'error')) { doFlush(); return; }
  scheduleFlush();
});

if (typeof window !== 'undefined') {
  window.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') doFlush({ useBeacon: true }); });
  window.addEventListener('pagehide', () => doFlush({ useBeacon: true }));
}
```

- [ ] **Step 4: 运行测试通过**

Run: `cd frontend && npx vitest run src/utils/__tests__/logger.test.js`
Expected: 全部 PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/utils/logger.js frontend/src/utils/__tests__/logger.test.js
git commit -m "feat(frontend-logger): 缓冲 flush + sendBeacon 卸载兜底 + localStorage 重试"
```

---

# 阶段 4 — 通知 UI 重写

### Task 10: ToastCard 印章风组件

**Files:**
- Create: `frontend/src/components/ui/ToastCard.jsx`

> 该组件为纯展示，由 `GlobalToast` 容器统一管理生命周期与动效；本任务只产出 Card 本体（受控组件），动效与 hover 暂停在 Task 11 合入。

- [ ] **Step 1: 实现 ToastCard**

```jsx
// frontend/src/components/ui/ToastCard.jsx
import { motion } from 'framer-motion';
import { X, XOctagon, AlertTriangle, Info, Check } from 'lucide-react';

const TYPE_META = {
  error:   { color: 'var(--we-color-status-danger)',  Icon: XOctagon,        seal: '驳' },
  warning: { color: 'var(--we-color-status-warning)', Icon: AlertTriangle,   seal: '警' },
  info:    { color: 'var(--we-color-status-info)',    Icon: Info,            seal: '录' },
  success: { color: 'var(--we-color-accent)',         Icon: Check,           seal: '成' },
};

export default function ToastCard({ toast, onClose, onMouseEnter, onMouseLeave }) {
  const meta = TYPE_META[toast.type] || TYPE_META.info;
  const Icon = meta.Icon;
  const isAssertive = toast.type === 'error';

  return (
    <motion.div
      role={isAssertive ? 'alert' : 'status'}
      aria-live={isAssertive ? 'assertive' : 'polite'}
      initial={{ opacity: 0, scale: 0.9, y: -8 }}
      animate={{ opacity: 1, scale: 1,   y: 0  }}
      exit={{    opacity: 0, x: 24, scale: 0.96, transition: { duration: 0.18 } }}
      transition={{ type: 'spring', stiffness: 420, damping: 22, mass: 0.6 }}
      whileHover={{ scale: 1.01 }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="relative pointer-events-auto w-80 overflow-hidden rounded-[var(--we-radius-md)] pl-4 pr-3 py-2.5"
      style={{
        background: 'var(--we-color-surface-paper)',
        boxShadow: '0 0 0 1px var(--we-color-border-subtle), 0 4px 12px rgba(0,0,0,0.08)',
        borderLeft: `4px solid ${meta.color}`,
      }}
    >
      <div className="flex items-start gap-2">
        <Icon size={16} style={{ color: meta.color, marginTop: 2 }} aria-hidden />
        <div className="flex-1 min-w-0">
          {toast.title && (
            <div className="font-serif text-[14px] leading-tight text-[var(--we-color-ink-primary)]">
              {toast.title}
            </div>
          )}
          <div className="text-[12.5px] leading-snug text-[var(--we-color-ink-secondary)] break-words">
            {toast.message}
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭通知"
          onClick={onClose}
          className="text-[var(--we-color-ink-tertiary)] hover:text-[var(--we-color-ink-primary)] -mt-1"
        >
          <X size={14} />
        </button>
      </div>
      <span
        aria-hidden
        className="absolute bottom-1 right-2 font-serif text-[20px] select-none pointer-events-none"
        style={{ color: meta.color, opacity: 0.18 }}
      >
        {meta.seal}
      </span>
    </motion.div>
  );
}
```

- [ ] **Step 2: 在 components/index.js 注册**

打开 `frontend/src/components/index.js`，按现有风格追加：

```js
export { default as ToastCard } from './ui/ToastCard.jsx';
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/ui/ToastCard.jsx frontend/src/components/index.js
git commit -m "feat(ui): ToastCard 印章风通知卡（受控组件）"
```

---

### Task 11: GlobalToast 重写（右上角堆叠 + hover pause + 关闭键）

**Files:**
- Modify: `frontend/src/components/ui/GlobalToast.jsx`
- Test: `frontend/src/components/ui/__tests__/GlobalToast.test.jsx`

- [ ] **Step 1: 写失败测试**

```jsx
// frontend/src/components/ui/__tests__/GlobalToast.test.jsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import GlobalToast from '../GlobalToast.jsx';

function dispatch(detail) {
  window.dispatchEvent(new CustomEvent('we:toast', { detail }));
}

describe('GlobalToast 重写', () => {
  beforeEach(() => { vi.useFakeTimers(); });

  it('error 显示 5 秒后消失', () => {
    render(<GlobalToast />);
    act(() => { dispatch({ message: 'oops', type: 'error' }); });
    expect(screen.getByText('oops')).toBeInTheDocument();
    act(() => { vi.advanceTimersByTime(5100); });
    expect(screen.queryByText('oops')).toBeNull();
  });

  it('info 显示 3 秒后消失', () => {
    render(<GlobalToast />);
    act(() => { dispatch({ message: 'hello', type: 'info' }); });
    act(() => { vi.advanceTimersByTime(3100); });
    expect(screen.queryByText('hello')).toBeNull();
  });

  it('点击关闭键立刻消失', () => {
    render(<GlobalToast />);
    act(() => { dispatch({ message: 'bye', type: 'info' }); });
    const close = screen.getByLabelText('关闭通知');
    fireEvent.click(close);
    act(() => { vi.advanceTimersByTime(500); });
    expect(screen.queryByText('bye')).toBeNull();
  });

  it('MAX_TOASTS=3 超出剔除最旧', () => {
    render(<GlobalToast />);
    act(() => {
      dispatch({ message: 'a', type: 'info' });
      dispatch({ message: 'b', type: 'info' });
      dispatch({ message: 'c', type: 'info' });
      dispatch({ message: 'd', type: 'info' });
    });
    expect(screen.queryByText('a')).toBeNull();
    expect(screen.getByText('d')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/GlobalToast.test.jsx`
Expected: FAIL（旧实现不符合新行为）

- [ ] **Step 3: 重写 GlobalToast**

替换 `frontend/src/components/ui/GlobalToast.jsx` 全文为：

```jsx
import { useEffect, useRef, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import ToastCard from './ToastCard.jsx';

const MAX_TOASTS = 3;
const DEDUP_MS = 1500;
const DURATION_BY_TYPE = { error: 5000, warning: 5000, info: 3000, success: 3000 };

export default function GlobalToast() {
  const [toasts, setToasts] = useState([]);
  const recentRef = useRef(new Map());
  const timersRef = useRef(new Map()); // id -> timeoutId

  const startTimer = useCallback((id, type) => {
    const ms = DURATION_BY_TYPE[type] ?? 3000;
    const tid = setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
      timersRef.current.delete(id);
    }, ms);
    timersRef.current.set(id, tid);
  }, []);

  const stopTimer = useCallback((id) => {
    const tid = timersRef.current.get(id);
    if (tid) { clearTimeout(tid); timersRef.current.delete(id); }
  }, []);

  const closeNow = useCallback((id) => {
    stopTimer(id);
    setToasts(prev => prev.filter(t => t.id !== id));
  }, [stopTimer]);

  useEffect(() => {
    function handle(event) {
      const { message = '', type = 'info', title = '' } = event.detail ?? {};
      if (!message) return;
      const now = Date.now();
      const last = recentRef.current.get(message);
      if (last && now - last < DEDUP_MS) return;
      recentRef.current.set(message, now);

      const id = crypto.randomUUID();
      setToasts(prev => {
        const next = [...prev, { id, message, type, title }];
        const overflow = next.length - MAX_TOASTS;
        if (overflow > 0) {
          for (let i = 0; i < overflow; i += 1) stopTimer(next[i].id);
          return next.slice(overflow);
        }
        return next;
      });
      startTimer(id, type);
    }
    window.addEventListener('we:toast', handle);
    return () => window.removeEventListener('we:toast', handle);
  }, [startTimer, stopTimer]);

  return (
    <div
      role="region"
      aria-label="通知"
      className="fixed top-4 right-4 z-[var(--we-z-toast)] flex flex-col items-end gap-3 pointer-events-none max-sm:left-2 max-sm:right-2 max-sm:top-2"
    >
      <AnimatePresence initial={false}>
        {toasts.map(toast => (
          <ToastCard
            key={toast.id}
            toast={toast}
            onClose={() => closeNow(toast.id)}
            onMouseEnter={() => stopTimer(toast.id)}
            onMouseLeave={() => startTimer(toast.id, toast.type)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 4: 运行测试通过**

Run: `cd frontend && npx vitest run src/components/ui/__tests__/GlobalToast.test.jsx`
Expected: 4 PASS

- [ ] **Step 5: 全量前端单测确认未破坏**

Run: `cd frontend && npm test`
Expected: 全部 PASS

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ui/GlobalToast.jsx frontend/src/components/ui/__tests__/GlobalToast.test.jsx
git commit -m "feat(ui): GlobalToast 右上角堆叠 + hover pause + 关闭键 + 时长分级"
```

---

### Task 12: 重写 utils/toast.js 为 logger 内部出口

**Files:**
- Modify: `frontend/src/utils/toast.js`

- [ ] **Step 1: 替换为内部说明**

把 `frontend/src/utils/toast.js` 全文替换为：

```js
/**
 * 内部出口：仅供 utils/logger.js 调用。
 * 组件请使用 utils/logger.js 的 log.{level}(...)。
 * 直接 import 本文件将被 lint 拦截（见 eslint-rules/no-direct-toast-import.js）。
 */
export function pushToast(message, type = 'success') {
  window.dispatchEvent(new CustomEvent('we:toast', { detail: { message, type } }));
}
export function pushErrorToast(message)   { pushToast(message, 'error');   }
export function pushWarningToast(message) { pushToast(message, 'warning'); }
export function pushInfoToast(message)    { pushToast(message, 'info');    }
```

> 暂保留导出，为下一步迁移做兼容；Task 16 lint 启用后会被守门。

- [ ] **Step 2: Commit**

```bash
git add frontend/src/utils/toast.js
git commit -m "chore(toast): 标注为 logger 内部出口（待迁移）"
```

---

# 阶段 5 — 前端调用点迁移 + lint 守门

### Task 13: 迁移 ~50 处 pushErrorToast 调用

**Files:**
- Modify: 以下文件中所有 `pushErrorToast` 调用点（grep 结果约 15 个文件 / 50 处）：
  - `frontend/src/components/settings/RegexRulesManager.jsx`
  - `frontend/src/components/settings/ProviderBlock.jsx`
  - `frontend/src/components/settings/WritingLlmBlock.jsx`
  - `frontend/src/components/settings/CustomCssManager.jsx`
  - `frontend/src/components/settings/RegexRuleEditor.jsx`
  - `frontend/src/components/settings/AuxLlmBlock.jsx`
  - `frontend/src/components/state/EntrySection.jsx`
  - `frontend/src/components/state/EntryEditor.jsx`
  - `frontend/src/components/chat/InputBox.jsx`
  - `frontend/src/components/chat/Sidebar.jsx`
  - `frontend/src/components/book/{NearbyPanel,AddSavedNearbyModal,WritingSessionList,StatePanel,MakeCardModal,SessionListPanel,NearbyCharacterBlock}.jsx`
  - `frontend/src/pages/{WorldsPage,PersonaEditPage,CharactersPage,WorldEditPage,ChatPage,WritingSpacePage,CharacterEditPage}.jsx`

- [ ] **Step 1: 在每个文件做替换**

每个 import 行 `import { pushErrorToast } from '...';` → `import { log } from '<相对路径>/utils/logger.js';`
每处 `pushErrorToast('xxx')` → `log.error('<event>', null, { toast: 'xxx' });`
每处 `pushErrorToast(err.message || 'xxx')` → `log.error('<event>', err, { toast: 'xxx' });`
每处 `pushToast('已保存为角色卡')`（success） → `log.info('character.create.success', null, { toast: '已保存为角色卡' });`（特殊：info 级且显式 toast）

`<event>` 命名规范：`<域>.<动作>.<结果>`。建议映射（可灵活）：
- `RegexRulesManager`：`regex.rules.load_failed` / `regex.rules.delete_failed`
- `ProviderBlock` / `WritingLlmBlock` / `AuxLlmBlock`：`settings.provider.save_failed`
- `CustomCssManager`：`css.snippets.save_failed`
- `RegexRuleEditor`：`regex.rule.validate_failed` / `regex.rule.save_failed`
- `EntrySection`：`entry.delete_failed` / `entry.toggle_failed`
- `EntryEditor`：`entry.fields.load_failed` / `entry.role.invalid` / `entry.save_failed`
- `InputBox`：`chat.image.too_large`
- `Sidebar`：`session.create_failed` / `session.delete_failed` / `session.rename_failed`
- `book/NearbyPanel` / `StatePanel`：`state.world.reset_failed` / `state.player.reset_failed` / `state.character.reset_failed` / `state.world.update_failed` / `state.player.update_failed` / `state.character.update_failed` / `diary.fetch_failed`
- `MakeCardModal`：`card.analyze_failed` / `card.name.invalid` / `card.create_failed` / `card.create.success`
- `book/AddSavedNearbyModal`：`nearby.add.duplicate` / `nearby.add.failed`
- `WritingSessionList` / `SessionListPanel`：与 Sidebar 同
- `NearbyCharacterBlock`：`nearby.toggle_failed` / `nearby.remove_failed` / `nearby.state.update_failed` / `nearby.memory.update_failed`
- `WorldsPage`：`world.export_failed` / `world.sort.save_failed` / `world.import_failed`
- `PersonaEditPage`：`persona.state.save_failed` / `persona.avatar.upload_failed` / `persona.save_failed` / `persona.export_failed`
- `CharactersPage`：`character.delete_failed` / `character.activate_failed` / `character.import_failed`
- `WorldEditPage`：`world.cover.upload_failed`
- `ChatPage`：`chat.continue_failed` / `chat.proxy_failed`
- `WritingSpacePage`：`writing.proxy_failed` / `writing.title.generate_failed` / `writing.chapter.title.save_failed` / `writing.chapter.title.generate_failed`
- `CharacterEditPage`：`character.state.save_failed` / `character.avatar.upload_failed` / `character.export_failed`

- [ ] **Step 2: 抽样跑前端单测**

Run: `cd frontend && npm test`
Expected: 全部 PASS（迁移不应改变行为）

- [ ] **Step 3: 手工启动前端，触发任一已知错误（如把后端 /api/sessions DELETE 临时返回 500）**

确认右上角弹出印章风错误卡，console 有 `[<event>]` 输出。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/
git commit -m "refactor(frontend): 全部 toast 调用迁移到 log.{level}（统一 event 命名）"
```

---

### Task 14: ESLint 自定义规则禁止组件直接 import utils/toast.js

**Files:**
- Create: `eslint-rules/no-direct-toast-import.js`
- Modify: `eslint.config.js`（项目根）

- [ ] **Step 1: 实现规则**

```js
// eslint-rules/no-direct-toast-import.js
export default {
  meta: { type: 'problem', schema: [], messages: { forbidden: '组件不得直接 import utils/toast.js，请使用 utils/logger.js 的 log API' } },
  create(context) {
    return {
      ImportDeclaration(node) {
        const src = node.source.value;
        if (typeof src !== 'string') return;
        if (!/utils\/toast(\.js)?$/.test(src)) return;
        const filename = context.getFilename();
        if (filename.endsWith('utils/logger.js')) return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
```

- [ ] **Step 2: 在前端 eslint.config.js 启用**

打开根目录 `eslint.config.js`，参照现有 plugins 注册方式追加（具体写法依现有 flat config 风格）：

```js
import noDirectToastImport from './eslint-rules/no-direct-toast-import.js';

// 在适用 frontend/src/** 的 config 块的 plugins 与 rules 中追加：
plugins: { 'we-local': { rules: { 'no-direct-toast-import': noDirectToastImport } } },
rules: { 'we-local/no-direct-toast-import': 'error' }
```

- [ ] **Step 3: 跑 lint 确认通过**

Run: `npm run lint`
Expected: 通过（如有 import 残留则报错并需补迁移）

- [ ] **Step 4: Commit**

```bash
git add eslint-rules/no-direct-toast-import.js eslint.config.js
git commit -m "chore(lint): 禁止组件直接 import utils/toast.js"
```

---

### Task 15: 在 main.jsx 显式 import logger（确保副作用挂载）

**Files:**
- Modify: `frontend/src/main.jsx`

- [ ] **Step 1: 顶部追加 import**

```js
import './utils/logger.js';
```

确保 visibilitychange / pagehide 事件监听器在应用启动时挂上。

- [ ] **Step 2: 手工验证 sendBeacon 兜底**

启动前后端 → 在前端触发若干 `log.warn` → 关闭浏览器标签页 → 检查 `data/logs/worldengine-YYYY-MM-DD.log` 是否含未发送的日志（可能略有延迟）。

- [ ] **Step 3: Commit**

```bash
git add frontend/src/main.jsx
git commit -m "chore(frontend): 启动时显式挂载 logger 副作用监听器"
```

---

# 阶段 6 — 后端覆盖补全 + 级别校准 + lint

### Task 16: 在每条 mutation 路由出入口加 requestId 关联日志

**Files:**
- Modify: `backend/server.js`（在 requestIdMiddleware 之后追加请求摘要中间件）

- [ ] **Step 1: 追加请求摘要中间件**

在 `backend/server.js` 中，紧接 `app.use(requestIdMiddleware);` 之后插入：

```js
app.use((req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();
  const startedAt = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - startedAt;
    serverLog.info(`http ${formatMeta({ method: req.method, path: req.path, status: res.statusCode, ms })}`);
  });
  next();
});
```

- [ ] **Step 2: 手工验证**

启动后端，`curl -X POST` 任一变更接口，确认日志有一行带 `rid=<8位>` 的 `http info`。

- [ ] **Step 3: Commit**

```bash
git add backend/server.js
git commit -m "feat(http): mutation 请求摘要日志（含 method/path/status/ms）"
```

---

### Task 17: routes/* 入参校验 warn + 500 error 补齐

**Files:**
- Modify: `backend/routes/*.js`（约 25 个文件）

> 此为 sweep 任务，不强制 TDD；按以下规则机械修改。

- [ ] **Step 1: 列出所有路由文件**

Run: `ls backend/routes/`

- [ ] **Step 2: 对每个文件按规则改造**

对每个 `try { ... } catch (err) {` 块：
- 若当前没有 logger，在文件顶部加：`import { createLogger, formatMeta } from '../utils/logger.js'; const log = createLogger('route', 'cyan');`
- 在 catch 内、`res.status(500)` 之前追加：
  ```js
  log.error(`<routeName>.unhandled ${formatMeta({ method: req.method, path: req.path, msg: err?.message })}`);
  ```
- 入参校验失败 `res.status(400)` 之前追加：
  ```js
  log.warn(`<routeName>.bad_request ${formatMeta({ method: req.method, path: req.path, reason: '<具体原因>' })}`);
  ```
- 404（资源不存在）之前追加：
  ```js
  log.warn(`<routeName>.not_found ${formatMeta({ id: <id变量> })}`);
  ```

`<routeName>` 取文件名（如 `worlds`、`characters`）。

- [ ] **Step 3: 跑后端单测确认未破坏**

Run: `cd backend && npm test`

- [ ] **Step 4: Commit**

```bash
git add backend/routes/
git commit -m "feat(logger): routes 全量补齐 warn(校验失败/404) + error(500)"
```

---

### Task 18: services/* 业务异常 error + 关键状态变更 info

**Files:**
- Modify: `backend/services/*.js`（约 20 个文件）

- [ ] **Step 1: sweep**

每个 service 文件：
- 顶部加 `import { createLogger, formatMeta } from '../utils/logger.js'; const log = createLogger('svc', 'green');`
- 关键 state-changing 操作完成后追加 `info`：例如 `createSession` 成功后 → `log.info(\`session.create ${formatMeta({ sessionId, worldId, characterId })}\`);`
- 所有 `catch (err)` 内追加 `log.error(\`<service>.<action>.failed ${formatMeta({ ..., msg: err.message })}\`);`，再 `throw`（保留原行为）

- [ ] **Step 2: 跑后端单测**

Run: `cd backend && npm test`

- [ ] **Step 3: Commit**

```bash
git add backend/services/
git commit -m "feat(logger): services 关键状态变更 info + 异常 error"
```

---

### Task 19: db/queries/* 慢查询 warn + SQL 异常 error

**Files:**
- Modify: `backend/db/index.js`（在 prepare/exec 包装层加慢查询日志）

> 不在每个 query 文件单独加 try/catch，避免污染；改为在 db wrapper 层统一计时。

- [ ] **Step 1: 阅读 db/index.js**

Run: `cat backend/db/index.js`

- [ ] **Step 2: 包装 prepare/exec**

如果 `db.prepare`、`db.exec` 是直接 re-export，则改为包装：

```js
import { createLogger, formatMeta } from '../utils/logger.js';
const log = createLogger('db', 'blue');
const SLOW_MS = 200;

const _origPrepare = db.prepare.bind(db);
db.prepare = (sql) => {
  const stmt = _origPrepare(sql);
  for (const m of ['run', 'get', 'all']) {
    if (typeof stmt[m] !== 'function') continue;
    const orig = stmt[m].bind(stmt);
    stmt[m] = (...args) => {
      const t = Date.now();
      try {
        return orig(...args);
      } catch (err) {
        log.error(`sql.${m}.error ${formatMeta({ sql: sql.slice(0, 120), msg: err.message })}`);
        throw err;
      } finally {
        const ms = Date.now() - t;
        if (ms >= SLOW_MS) log.warn(`sql.slow ${formatMeta({ ms, sql: sql.slice(0, 120) })}`);
      }
    };
  }
  return stmt;
};
```

> 若 db wrapper 已是单例，注意 monkey-patch 时机要在所有 query 模块 import 之前。可以在文件末尾导出前 patch。

- [ ] **Step 3: 跑后端单测**

Run: `cd backend && npm test`

- [ ] **Step 4: Commit**

```bash
git add backend/db/index.js
git commit -m "feat(logger): db 层慢查询 warn(>=200ms) + SQL 异常 error"
```

---

### Task 20: llm/providers/* 请求 debug + 失败 error + token info

**Files:**
- Modify: `backend/llm/providers/{anthropic,gemini,openai-compatible}.js`、`backend/llm/index.js`

- [ ] **Step 1: 在每个 provider 顶部加 logger**

`const log = createLogger('llm', 'magenta');`

- [ ] **Step 2: 在请求发起前 / 收到响应后追加日志**

- 请求开始：`log.debug(\`provider.request ${formatMeta({ provider: '<name>', model, msgs: messages.length })}\`);`
- 非 200：`log.error(\`provider.http_error ${formatMeta({ provider, status, msg: errorBody })}\`);`
- 解析失败：`log.error(\`provider.parse_error ${formatMeta({ provider, msg: err.message })}\`);`
- token 用量（若 response 含）：`log.info(\`provider.usage ${formatMeta({ provider, model, prompt_tokens, completion_tokens })}\`);`

> 优先复用现有 console.* 调用点，把它们替换为分级 logger，不新增重复。

- [ ] **Step 3: 跑后端单测**

Run: `cd backend && npm test`

- [ ] **Step 4: Commit**

```bash
git add backend/llm/
git commit -m "feat(logger): llm providers 请求 debug + 失败 error + token info"
```

---

### Task 21: memory/ + prompts/assembler.js + async-queue + cleanup-registrations + assistant/server

**Files:**
- Modify: `backend/memory/*.js`、`backend/prompts/assembler.js`、`backend/utils/async-queue.js`、`backend/services/cleanup-registrations.js`、`assistant/server/*.js`

- [ ] **Step 1: memory/**

每个 memory 模块：
- 摘要/状态更新成功 → `log.info('mem.<action>.ok ...')`
- 失败（不阻断）→ `log.warn('mem.<action>.failed ...')`

- [ ] **Step 2: prompts/assembler.js**

> 锁定文件。**仅替换现有 console.* 为 logger，且不改动段位顺序与组装逻辑**。
- 段位被跳过 → `log.debug('prompt.section.skipped ...')`
- 字段缺失 → `log.debug('prompt.field.missing ...')`
- 条目命中数 → `log.debug('prompt.entries.matched ...')`

- [ ] **Step 3: utils/async-queue.js**

- 入队 → `log.debug('queue.enqueue ...')`
- 出队 → `log.debug('queue.dequeue ...')`
- 任务失败 → `log.warn('queue.task_failed ...')`
- 优先级 4/5 被丢弃 → `log.info('queue.dropped ...')`

- [ ] **Step 4: services/cleanup-registrations.js**

- 钩子失败 → `log.warn('cleanup.hook_failed ${formatMeta({ entity, id, hook, msg })}')`（按现有约束不影响 DELETE）

- [ ] **Step 5: assistant/server/**

- parent/sub-agent 步骤 → `log.info('assistant.<step>.start' / '.done')`
- 工具调用失败 → `log.warn('assistant.tool.failed ...')`

- [ ] **Step 6: 跑后端单测**

Run: `cd backend && npm test`

- [ ] **Step 7: Commit**

```bash
git add backend/memory/ backend/prompts/assembler.js backend/utils/async-queue.js backend/services/cleanup-registrations.js assistant/server/
git commit -m "feat(logger): memory/prompts/queue/cleanup/assistant 全量分级日志"
```

---

### Task 22: ESLint 自定义规则禁止 backend 直接 console.*

**Files:**
- Create: `eslint-rules/no-backend-console.js`
- Modify: `eslint.config.js`

- [ ] **Step 1: 实现规则**

```js
// eslint-rules/no-backend-console.js
export default {
  meta: {
    type: 'problem',
    schema: [],
    messages: { forbidden: 'backend 禁止直接 console.{log,info,warn,error}，请使用 utils/logger.js 的 createLogger' },
  },
  create(context) {
    return {
      MemberExpression(node) {
        if (node.object?.name !== 'console') return;
        const prop = node.property?.name;
        if (!['log', 'info', 'warn', 'error', 'debug'].includes(prop)) return;
        context.report({ node, messageId: 'forbidden' });
      },
    };
  },
};
```

- [ ] **Step 2: 在 eslint.config.js 中对 backend/** 启用**

```js
import noBackendConsole from './eslint-rules/no-backend-console.js';
// 适用 backend/** 的 config 块：
plugins: { 'we-local': { rules: { 'no-backend-console': noBackendConsole } } },
rules: { 'we-local/no-backend-console': 'error' }
```

- [ ] **Step 3: 跑 lint，按报错逐条改为 logger**

Run: `npm run lint`
Expected: 报错列表 → 全部用 `createLogger(...)` 改写或删除（debug 级日志可由 `log.debug` 取代）

- [ ] **Step 4: lint 通过 + 后端单测通过**

Run: `npm run lint && cd backend && npm test`

- [ ] **Step 5: Commit**

```bash
git add eslint-rules/no-backend-console.js eslint.config.js backend/
git commit -m "chore(lint): backend 禁止直接 console.*；逐文件改为 logger"
```

---

# 阶段 7 — 文档与端到端验证

### Task 23: 文档同步

**Files:**
- Modify: `ARCHITECTURE.md`、`CHANGELOG.md`、`CLAUDE.md`

- [ ] **Step 1: ARCHITECTURE.md 新增段**

在合适位置（建议放在末尾或与"日志/监控"相关章节）追加"§日志与通知"：
- 后端 logger 四级 + 文件按日轮换 + requestId 透传 + client 子 logger
- 前端 logger 三通道 + 缓冲 flush 触发条件 + sendBeacon 兜底 + localStorage 重试
- 通知 UI：右上角堆叠 / 印章风 / 入场弹跳 / 时长 5s/3s / hover pause

- [ ] **Step 2: CHANGELOG.md 追加一条**

```md
- 日志体系重构（2026-05-10）：后端 logger 加固（formatMeta 字段顺序/截断、requestId AsyncLocalStorage 透传、启动横幅、慢查询 warn、所有模块分级补齐）；新增 POST /api/client-logs 接收前端日志（同文件 [client] 前缀）；前端新增 utils/logger.js 统一 log API（toast/console/上报后端三通道，warn/error 缓冲+sendBeacon+localStorage 重试）；通知 UI 重写为印章风右上角堆叠（轻弹跳入场，error/warn 5s, info/success 3s, hover pause, MAX_TOASTS=3）；自定义 lint 规则禁止 backend console.* 与组件直接 import utils/toast.js。
```

- [ ] **Step 3: CLAUDE.md 在前端约束追加一行**

在"前端"约束块末尾追加：

```md
- 组件不得直接 import `utils/toast.js`，所有日志/通知必须经 `utils/logger.js` 的 `log.{debug,info,warn,error}` API（lint 已守门）
```

- [ ] **Step 4: Commit**

```bash
git add ARCHITECTURE.md CHANGELOG.md CLAUDE.md
git commit -m "docs: 同步日志与通知体系（ARCHITECTURE/CHANGELOG/CLAUDE）"
```

---

### Task 24: 端到端人工验证

**Files:** 无修改

- [ ] **Step 1: 启动前后端**

```bash
cd backend && npm run dev   # 终端 A
cd frontend && npm run dev  # 终端 B
```

- [ ] **Step 2: 验证场景 1 — 错误上报闭环**

- 临时修改 `backend/routes/sessions.js` DELETE 接口让其抛错（`throw new Error('manual test')`）
- 浏览器进入会话列表 → 点删除 → 期望：
  - 右上角弹印章风红卡 5 秒
  - DevTools console 出现 `[session.delete_failed]` 错误
  - 5 秒内 backend `data/logs/worldengine-YYYY-MM-DD.log` 出现 `[client] ERROR ... session.delete_failed ... page="/" ua="..." feSession="..."`
- 改回 routes/sessions.js

- [ ] **Step 3: 验证场景 2 — sendBeacon 兜载兜底**

- 触发若干 `log.warn`（任意会失败的操作）
- 在 5 秒 flush 间隔内立刻关闭浏览器标签
- 验证 backend 日志含被关闭前的最后日志

- [ ] **Step 4: 验证场景 3 — reduced-motion 退化**

- 系统设置开启「减少动效」（macOS：辅助功能 → 显示 → 减少动态效果）
- 触发 toast → 验证无 spring 弹跳，仅淡入

- [ ] **Step 5: 验证场景 4 — dedupe**

- 500ms 内连发 3 次同 message → 验证只显示 1 张

- [ ] **Step 6: 验证场景 5 — 慢查询 warn**

- 在某 query 前后插入 `setTimeout` 模拟，触发任一接口 → 期望 backend 日志出现 `db warn sql.slow  ms=... sql="..."`
- 测完移除模拟

- [ ] **Step 7: 全量回归**

```bash
npm run check
```
Expected: lint + 前后端单测 + assistant 单测 全部通过

- [ ] **Step 8: 完成提交（如验证过程产生 fix）**

```bash
git status   # 应为干净
```

---

## Self-Review 结果

执行后自检：
- 每个 §（spec 1-9 节）都对应到任务：§1→Task 1-26 全部、§2→Task 1-3、§3→Task 4-7+16-22、§4→Task 8-9、§5→Task 5-7+9、§6→Task 10-11、§7→Task 24、§8→Task 23、§9 不做（已排除）
- 无 TBD/TODO；所有"sweep"任务都给出了具体规则模板而非"按需补"
- 类型/方法名一致性：`getClientLogger / formatMeta / runWithContext / getRequestId / log.{level} / __setFlush / __resetLoggerForTest / pushToast` 跨任务一致
- 每个 step ≤5 分钟（sweep 任务步骤偏长，但拆分后机械）

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-10-logging-overhaul.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
