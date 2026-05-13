# WorldEngine 用户体验审计报告

> **审计分支**：`assistant-agent-loop`  
> **审计日期**：2026-05-13  
> **审计范围**：前端核心交互链路（ChatPage / WritingSpacePage / StatePanel / InputBox / MessageList）、后端 API 与流处理（SSE / 异步队列 / 状态回滚）、助手模块（AssistantPanel）  
> **审计维度**：从用户实际体验出发，审查功能逻辑硬伤、竞态条件、错误处理缺失、边界情况覆盖、加载/空/错误三态完整性

---

## 问题分级说明

| 级别 | 定义 | 用户感知 |
|---|---|---|
| **P0** | 硬伤 | 功能不可用、数据不一致、或导致用户困惑的明显 bug |
| **P1** | 严重影响体验 | 反直觉、流程断裂、缺少反馈，用户能 workaround 但很糟 |
| **P2** | 建议优化 | 细节缺失、体验不流畅，建议改进 |

---

## 🔴 P0 硬伤（必须修复）

### P0-1: Slash 命令 `/retry`、`/title` 在生成过程中仍可触发

**用户视角**：AI 正在回复时，我输入 `/retry` 或 `/title`，命令被执行，导致当前生成与重试/重命名竞态，界面可能卡死或显示混乱。

**代码位置**：`frontend/src/components/chat/InputBox.jsx:71-80`

```jsx
function executeCommand(cmd) {
    setText('');
    setSlashOpen(false);
    switch (cmd) {
      case '/continue':    onContinue?.();    break;
      case '/impersonate': onImpersonate?.(); break;
      case '/retry':       onRetry?.();       break;   // ← 无 generating 检查
      case '/title':       onTitle?.();       break;   // ← 无 generating 检查
    }
}
```

**修复建议**：在 `executeCommand` 开头增加 `if (generating) return;`，与 `/continue`、`/impersonate` 保持一致。

**复现步骤**：
1. 进入任意聊天会话，发送一条消息触发 AI 生成
2. 在输入框中输入 `/retry` 或 `/title`
3. 回车执行命令 → 当前生成与重试/重命名竞态

---

### P0-2: 日记选中后内容获取失败，UI 状态与实际注入不一致

**用户视角**：我点击了一条日记条目，UI 显示已选中（高亮），但该日记内容并未注入到下一轮提示词中。我以为注入了，但实际没有。

**代码位置**：`frontend/src/components/state/StatePanel.jsx:191-204`

```jsx
async function handleDiarySelect(entry) {
    if (selectedEntry?.date_str === entry.date_str) { ... }
    setSelectedEntry(entry);        // ← UI 先更新
    try {
      const content = await fetchDiaryContent(sessionId, entry.date_str);
      onDiaryInject?.(content);      // ← 失败时不执行，但 UI 已显示选中
    } catch (e) { ... }
}
```

**修复建议**：将 `setSelectedEntry(entry)` 移到 `fetchDiaryContent` 成功后执行；失败时 toast 提示并保持未选中状态。

**复现步骤**：
1. 进入有日记的会话
2. 点击右侧日记列表中的某一条
3. 如果 `fetchDiaryContent` 请求失败（如网络中断），UI 显示已选中但实际未注入

---

### P0-3: 切换角色后日记注入内容未被清理，带到新会话

**用户视角**：我在角色 A 的会话中选中了一条日记准备注入，然后切换到角色 B，发送了一条消息，结果角色 A 的日记内容被注入到了角色 B 的对话中。

**代码位置**：`frontend/src/pages/ChatPage/index.jsx:235-261` (`clearActiveSession`)

```jsx
const clearActiveSession = useCallback(() => {
    invalidateCurrentRun();
    recoveryStopRef.current?.();
    recoveryStopRef.current = null;
    clearOptionsState();
    setCurrentSessionId(null);
    setCurrentSession(null);
    setGenerating(false);
    setStreamingText('');
    setErrorBubble(null);
    // ... 大量清理
    // 但未清理 pendingDiaryInject ← 缺失
}, [...]);
```

**修复建议**：在 `clearActiveSession` 中增加 `setPendingDiaryInject(null)`。

**复现步骤**：
1. 进入角色 A 的聊天页，点击右侧日记条目选中它
2. 切换到角色 B（不发送消息）
3. 在角色 B 的会话中发送消息 → 角色 A 的日记内容被注入

---

### P0-4: SSE 解析到 malformed events 时静默忽略，关键事件丢失可导致前端状态永久卡住

**用户视角**：生成完成后，"发送"按钮一直是"停止"状态，或者"整理中"overlay 永远显示，页面像死了一样。

**代码位置**：`frontend/src/api/stream-parser.js:75-77`

```jsx
try {
  const evt = JSON.parse(json);
  // ... dispatch
} catch {
  // ignore malformed events  ← 静默丢弃，包括可能是关键事件
}
```

**修复建议**：增加 malformed event 日志（至少 `console.warn`），并考虑在检测到连接异常时触发 `onError`。

**复现步骤**：
1. 在不稳定网络环境下进行对话生成
2. 后端推送了格式异常的 SSE 事件（如 JSON 截断）
3. 前端静默丢弃 → 可能错过 `done` / `state_updated` 等关键事件

---

### P0-5: 附件文件读取失败（过大/损坏）被静默跳过，无用户反馈

**用户视角**：我选了 3 张图片发送，但只成功上传了 2 张，第 3 张没有任何提示就消失了。

**代码位置**：`frontend/src/components/chat/InputBox.jsx:138-152`

```jsx
const reader = new FileReader();
reader.onload = (ev) => { ... };
reader.readAsDataURL(file);
// ← 缺少 reader.onerror 处理
```

**修复建议**：增加 `reader.onerror` 处理器，将失败的文件名称加入 `rejected` 数组，统一提示用户。

**复现步骤**：
1. 选择一张损坏的图片文件或超大文件（>5MB）
2. 发送消息 → 文件被静默跳过，无错误提示

---

## 🟠 P1 严重影响体验

### P1-1: 消息列表/会话列表加载失败时显示空白，无错误提示

**用户视角**：打开聊天页面，消息区域空白，我不知道是"这个会话没有消息"还是"网络断了加载失败"。

**代码位置**：
- `frontend/src/components/chat/MessageList.jsx:137-139`
- `frontend/src/pages/ChatPage/components/SessionListPanel.jsx:42-45`

```jsx
// MessageList
catch {
  if (!cancelled) setLoading(false);  // ← 无错误提示
}
// SessionListPanel  
catch {
  if (!cancelled) setSessions([]);    // ← 无错误提示
}
```

**修复建议**：增加 error 状态，加载失败时显示"加载失败，点击重试"的占位UI。

---

### P1-2: 状态栏/日记加载失败后显示为空，用户无法区分"无数据"和"加载失败"

**用户视角**：右侧状态栏全部空白，我以为这个角色没有配置状态字段，实际上是请求失败了。

**代码位置**：`frontend/src/hooks/useSessionState.js:66-79`

```jsx
fetchSessionStateValues(sessionId)
  .then((data) => { if (!cancelled) setStateData(data); })
  .catch(() => { if (!cancelled) setStateData(EMPTY_STATE); });  // ← 静默降级
```

**修复建议**：区分 `null`（加载中）、`EMPTY_STATE`（加载成功但无数据）和加载失败状态，失败时显示重试按钮。

---

### P1-3: 写作页面初始化无 loading 状态，首次进入显示空白

**用户视角**：点击"进入写作空间"后，页面一片空白，过几秒才出现内容，我不知道是不是卡住了。

**代码位置**：`frontend/src/pages/WritingSpacePage/index.jsx:195-211`

```jsx
useEffect(() => {
  if (!worldId) return;
  listWritingSessions(worldId).then((sessions) => {
    // ...
  }).catch(() => {});  // ← 无 loading 状态管理
}, [worldId]);
```

**修复建议**：增加 `isInitializing` 状态，加载期间显示 skeleton 或 loading 指示器。

---

### P1-4: 角色/Persona 加载失败无提示，界面显示残缺

**用户视角**：进入聊天页面后，顶部没有角色名字，头像显示"?"，但我不知道发生了什么。

**代码位置**：`frontend/src/pages/ChatPage/index.jsx:280-289`

```jsx
getCharacter(characterId).then((c) => {
  if (cancelled) return;
  setCharacter(c);
  if (c.world_id) {
    getPersona(c.world_id).then((p) => { ... }).catch(() => {});  // ← 静默失败
    syncDiaryTimeField(c.world_id).catch(() => {});               // ← 静默失败
  }
}).catch(() => {});  // ← 静默失败
```

**修复建议**：关键数据加载失败时显示 toast 提示；或至少将错误记录到 console 供用户排查。

---

### P1-5: ErrorBoundary 崩溃后仅支持"重新加载页面"，无法保留用户输入

**用户视角**：页面崩溃了，我输入框里写了一半的长文全部丢失，只能刷新页面重来。

**代码位置**：`frontend/src/components/ui/ErrorBoundary.jsx:20-44`

**修复建议**：提供"尝试恢复"按钮，将当前页面状态（如输入框内容）缓存到 `sessionStorage` 并在恢复时还原。

---

### P1-6: 快速切换页面后，续写/生成状态残留导致 UI 混乱

**用户视角**：我在会话 A 点了续写，然后快速切换到会话 B，会话 B 的消息列表中出现了会话 A 的续写内容。

**代码位置**：`frontend/src/pages/ChatPage/index.jsx:752-829` (`handleContinue`)

```jsx
function handleContinue() {
  // 使用了 continuationTokenRef 隔离，但 continuingMessageIdRef 等未在 session 切换时清理
}
```

**修复建议**：在 `enterSession` / `clearActiveSession` 中彻底清理所有续写相关 ref 和 state。

---

### P1-7: 附件预览图片加载失败显示 broken image

**用户视角**：消息中的图片显示为裂图，没有任何提示。

**代码位置**：`frontend/src/components/chat/MessageItem.jsx:184-200` (`AttachmentThumbnail`)

```jsx
<img src={url} alt="附件" className="we-attachment-thumbnail" />
// ← 无 onError 处理器
```

**修复建议**：增加 `onError` 处理器，显示"图片加载失败"占位图。

---

### P1-8: `/impersonate` 覆盖用户已有输入无确认

**用户视角**：我正在输入框里写一条很长的消息，不小心点了"AI 代写"按钮，我写的所有内容被覆盖了，没有撤销办法。

**代码位置**：`frontend/src/components/chat/InputBox.jsx:35-41`

```jsx
useImperativeHandle(ref, () => ({
  fillText(value) {
    setText(value);
    setTimeout(() => textareaRef.current?.focus(), 0);  // ← 直接覆盖，无检查
  },
}));
```

**修复建议**：`fillText` 前检查 `text` 是否非空，非空时提示用户"输入框已有内容，是否覆盖？"。

---

### P1-9: ChatPage `handleSend` 中正则处理后的空内容仍被发送

**用户视角**：我发送了一条消息，但 AI 收到的似乎是空的，或者触发了后端的异常。

**代码位置**：`frontend/src/components/chat/InputBox.jsx:118-127`

```jsx
function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || generating) return;
    const processed = applyRules(trimmed, 'user_input', worldId ?? null, mode);
    onSend(processed, attachments);  // ← processed 可能为空字符串
}
```

**修复建议**：在 `applyRules` 后增加 `if (!processed.trim()) return;` 检查。

---

### P1-10: `handleImpersonate` 成功后用户焦点被强制拉到输入框

**用户视角**：我滚动消息列表查看历史内容，同时点了"AI 代写"，页面突然滚动到底部，我的阅读位置丢失了。

**代码位置**：`frontend/src/components/chat/InputBox.jsx:36-40`

```jsx
fillText(value) {
  setText(value);
  setTimeout(() => textareaRef.current?.focus(), 0);  // ← 强制 focus 导致 scroll
}
```

**修复建议**：由调用方决定是否 focus，不要在 `fillText` 中自动 focus；或在 `focus` 时使用 `preventScroll: true`。

---

## 🟡 P2 建议优化

| 编号 | 问题描述 | 代码位置 | 建议 |
|---|---|---|---|
| P2-1 | 状态栏手动修改后乐观更新失败不回滚 | `StatePanel.jsx:160-188` | 失败时将字段值恢复为修改前 |
| P2-2 | 写作页 `handleSend` 允许发送空内容 | `WritingSpacePage/index.jsx:604` | 增加 `content.trim()` 检查 |
| P2-3 | `handleChapterEdit`/`handleChapterRetitle` 不检查 `generating` | `WritingSpacePage/index.jsx:896-919` | 增加 `if (generating) return;` |
| P2-4 | 消息列表 `loadMore` 失败无提示 | `MessageList.jsx:170` | 显示"加载更多失败"提示 |
| P2-5 | `handleDeleteMessage` 是请求成功后才更新 UI，等待期间无反馈 | `ChatPage/index.jsx:864-882` | 先显示删除动画/loading，再请求 |
| P2-6 | `handleRetryAfterError` 和 `handleRetryLast` 缺少 loading 状态 | `ChatPage/index.jsx:885-931` | 按钮显示 loading 防止重复点击 |
| P2-7 | `FrozenOptionCard` 的 `initialCollapsed` 只在 mount 时生效 | `MessageList.jsx:27-56` | 改为受控模式或增加 `useEffect` 响应 prop 变化 |
| P2-8 | `ChatPage` 加载角色信息期间没有 skeleton/loading | `ChatPage/index.jsx:264-312` | 增加骨架屏 |
| P2-9 | SSE 连接无超时机制，网络挂起时永远等待 | `frontend/src/api/stream-parser.js` | 增加 AbortController + setTimeout 超时 |
| P2-10 | `WritingSpacePage` 进入时自动创建会话失败后无提示 | `WritingSpacePage/index.jsx:199-204` | 增加错误 toast |

---

## 问题分布总结

| 严重程度 | 数量 | 主要集中区域 |
|---|---|---|
| P0 硬伤 | 5 | InputBox 命令校验、StatePanel 状态一致性、SSE 健壮性、附件处理 |
| P1 严重影响 | 10 | 错误提示缺失、竞态条件、数据加载失败降级、用户操作覆盖 |
| P2 建议优化 | 10 | 加载状态、边界检查、交互反馈、超时机制 |

---

## 优先修复建议

1. **立即修复 P0-1、P0-2、P0-3** — 这 3 个是明确的逻辑缺陷，修复成本低，用户影响大
2. **本周内修复 P0-4、P0-5** — 涉及健壮性，影响极端场景下的用户体验
3. **下一迭代修复 P1 级别问题** — 重点补充加载失败时的错误提示和重试机制，这是目前体验最大的短板
4. **长期优化 P2** — 补充更多 loading 状态和边界检查，提升整体产品质感
