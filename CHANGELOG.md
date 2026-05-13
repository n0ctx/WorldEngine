- fix(theme): 改善 `lovable-cream` 主题视觉层次，解决"页面单调"问题。根本原因：卡片/条目行背景色与画布相同（均 `#f7f4ed`），加之 shadow 硬编码为 `none`，导致前景/背景无区分。修复：① `tokens.css` 新增 `--we-entry-row-bg` / `--we-entry-row-shadow` 两个 token；② `pages.css` 中 `.we-entry-section-row` 改用新 token（不再硬编码 `bg-canvas` 和 `box-shadow: none`），`.we-config-col .we-entry-section-desc` 颜色改为 `--we-entry-meta-color`（修复奶油背景下描述文字不可见 bug）；③ `lovable-cream` 主题：条目行改为白底 + 轻微双层阴影、世界/角色卡片改为白底 + 立体 hover 阴影、面板卡片改白底、区块标题恢复渐变分隔线、`--we-color-gold` 加深为 `rgba(28,28,28,0.5)` 使 hover 边框可感知、ink-wash 提升至 5–7%、paper-lift/stack 阴影从无到有轻量阴影。`classic-parchment` 不受影响（新 token 默认值等同现有行为）。

- fix(theme): 内核收口主题层，核心默认值改为中性、主题只负责视觉取值；`frontend/src/themes/fonts.css` 改成中性字体默认，`frontend/src/themes/tokens.css` 去掉 parchment 语义默认与装饰默认，`classic-parchment` / `lovable-cream` 补全字体与主题元信息覆盖；`themes/_template/theme.css` 重写为可复制骨架，`themes/README.md` 统一成当前分层与推荐 token 覆盖顺序。

- fix(theme): 修复 `lovable-cream`（simple）主题封面图文字不可读 + 标题斜体风格与 DESIGN.md 不符。① 新增 5 个 token（`tokens.css`）：`--we-page-canvas-title-style/weight`（标题字形/字重）、`--we-page-canvas-subtitle-display`（副标题可见性）、`--we-card-name-font-style/weight`（卡片名字形/字重）；`pages.css` 中世界/角色页面标题和卡片名称使用这些 token。② `lovable-cream` 覆盖：标题改为 normal weight-600、副标题隐藏（`none`）、卡片名改为 normal weight-400；③ `lovable-cream` 封面图修复：`--we-card-cover-text-color` 改为 `#fcfbf8`（浅色）、`--we-card-cover-meta-color` 改为半透明浅色、`--we-card-overlay-bg` 加底部渐变遮罩（`rgba(0,0,0,0.55)→transparent`）保证封面文字在任意底图上可读。

- fix(theme): 修复 `lovable-cream`（simple）主题视觉与 DESIGN.md 不符的三个结构性问题。① 新增 4 个 `--we-page-canvas-*` token（`tokens.css`）将 WorldsPage / CharactersPage / 编辑页大画布背景与文字色抽象为独立 token，默认值保持暗书架语义；`lovable-cream` 覆盖为奶油背景 + 深色文字，`classic-parchment` 无需改动（自动继承）。② `pages.css` 将 canvas 背景、标题/副标题/操作按钮/空态/加载态等约 20 处硬绑定的 `--we-color-bg-inverse` / `--we-color-bg-canvas` / `--we-color-border-default` / `--we-color-bg-muted` 引用全部改为 `--we-page-canvas-*` token。③ `ui.css` 将 `.we-btn` 圆角从 `--we-radius-none`（1px）改为 `--we-radius-sm`（6px），符合 DESIGN.md 按钮 6px 规范；classic-parchment 继承默认值不变。④ `themes/_template/theme.css` 更新为完整 §1–§11 分节模板，覆盖所有当前可覆盖 token 分类。

- fix(theme): 修复 `lovable-cream`（simple）主题视觉不符合 DESIGN.md 的问题。根本原因：`pages.css`、`index.css`、`ui.css` 中有约 10 处硬编码 rgba 色值与 SVG 噪声纹理，token 系统无法触达。修复方案：在 `tokens.css` 新增 13 个 `--we-*` 装饰控制 token（`--we-canvas-texture-image`、`--we-card-overlay-bg`、`--we-parchment-display`、`--we-spine-display`、`--we-bookmark-display` 等），将所有硬编码值改为 token 引用；`classic-parchment` 主题补全对应 token（保留现有外观），`lovable-cream` 主题设为关闭（无纹理、无覆盖层、无书脊/书签装饰）。

- fix(assistant): 收紧子代理失败链路。`dispatch_subagent` 在子代理返回 `success:false` 时不再把失败结果继续喂给父代理收尾文本，而是直接抛 `PAUSED` 控制信号；父代理收到该信号后立即走 `pauseSubagentFailed`，把失败原因以 assistant 气泡提示给用户，避免出现“已经做完了”但实际没落库的误导性完成口径。同步补回归覆盖“子代理失败时不再继续输出 reply_to_user”。

- feat(assistant): 写卡助手计划草案区在会话页面（/characters/:id/chat、/worlds/:id/writing）下改为全屏展示：awaiting_approval 时 planDoc 预览区从 max-h-56 改为 flex-1 填满面板剩余高度；非会话页面保持原有紧凑布局。

- style(frontend): 将 CharactersPage 左上返回按钮文案从”所有世界”改为”书架”，与世界列表页的入口语义统一。验证：打开角色列表页，左上角返回按钮应显示”← 书架”。

- feat(theme): 新增 `lovable-cream` 内置主题。严格遵循 `DESIGN.md`（Lovable 暖 cream 设计系统）映射到 WorldEngine token 体系：① 画布 `#f7f4ed`、表面与画布无缝融合；② 全部灰色由 `#1c1c1c` 透明度派生（0.03–0.83），保持色调统一；③ 主交互/强调色 = 炭灰 `#1c1c1c`，无饱和 accent；④ 边框 `#eceae4` 承担层级，卡片/面板 shadow 设为 `none`；⑤ 深色按钮保留 Lovable signature multi-layer inset shadow；⑥ TopBar 深色底色 `#1c1c1c` + off-white 文字；⑦ 书脊阴影全部透明（无书脊概念）；⑧ 状态色去饱和（moss/amber/slate 均压为暖灰/暗绿/暗棕）；⑨ 卡片圆角升至 12px。主题文件：`themes/lovable-cream/theme.json` + `theme.css`。

- fix(assistant): 修复写卡助手重复确认与低质量计划。`write_plan_doc` 新增两道工具层硬护栏：用户批准计划后的续跑阶段拒绝再次提交计划，避免 Task HUD 消失后又回到 `awaiting_approval` 二次确认；计划至少需要 3 个可执行 step，1-2 个动作直接派发子代理执行，不写 plan、不设置审批 checkpoint、不发 `plan_doc_updated/awaiting_approval`。同步更新父代理 prompt、CONTRACT 与 ARCHITECTURE 的计划门槛描述，并补回归覆盖少于 3 步拒绝、批准后重复 `write_plan_doc` 被拦、3 步计划仍可审批执行。

- style(config): WorldConfigPage 去卡片化 + 去立体效果。① `.we-config-col` 移除白色面板背景、边框、圆角和 `--we-shadow-paper-stack` 立体阴影，改为透明容器直接浮于深棕画布上；② `.we-entry-section-row` 去掉 `inset` 内光和外阴影，改为无阴影平面风格；hover 态保留金色边框变色，移除浮起阴影；③ 新建按钮移除 `--we-shadow-stamp-up`/`stamp-down` 印章立体效果，active 态改为 opacity 反馈；④ 在 `.we-config-col` 上下文中将 desc 文字色从深墨色覆盖为 `--we-color-border-default`（暖浅灰 #e2e2dc），确保在暗色背景下可读。

- style(config): WorldConfigPage 视觉微调。① `.we-entry-section-desc` 颜色从边框色（`--we-color-border-default`）改为次要文字色（`--we-color-text-secondary`），解决副标题几乎不可读的问题；② `.we-config-grid` 列间距从 `--we-space-sm`(8px) 增至 `--we-space-md`(12px)，顶部留白从 `--we-space-lg`(16px) 减至 `--we-space-sm`(8px)；③ 四列图标从统一 ❦ 改为语义符号（常驻⚓ / 关键词◈ / AI召回✦ / 状态条件⬡）。

- style(ui): classic-parchment 全页面审美精装改造（7 维度）。① 配置页四列引入中间调容器背景（`--we-color-bg-surface`），形成深背景→列容器→条目卡三台阶色层，并加 `--we-shadow-paper-stack` 投影和边框；② 四列标题差异化着色（常驻=朱砂、关键词=金箔、AI召回=苔绿、状态条件=琥珀），列标题底部加金箔渐变装饰线；③ 按钮语义修正：`+新建` 从虚线描边改为填色朱砂印章风格（`--we-shadow-stamp-up`），`新建会话` 从朱砂虚线改为实线中性边框，`.we-btn-ghost` 全局从朱砂虚线改为实线，`删除` 动作加下划线文字链接样式；④ 日期格式叙事化：新建 `core/utils/date-format.js` 导出 `formatDateLiterary()`（今日/昨日/X月X日/YYYY年X月），替换 `SessionItem.jsx` 与 `WritingSessionList.jsx` 中的内联 `formatDate`；⑤ 条目行 hover 边框从 amber 改为金箔色，hover 阴影升级为 `--we-shadow-paper-stack-hover`，拖拽手柄透明度和字号加强；⑥ 表单控件 `we-input` / `we-textarea` 加 `--we-shadow-paper-indent` 凹陷效果，focus 态补 accent-bg 光晕；⑦ WorldConfigPage BackButton label 从"所有世界"改为"书架"，四列 div 补全 `data-type` 属性启用类型着色。

- fix(theme): classic-parchment 主题视觉修复（8 项）。① `--we-base-book-bg` 从 `#4a3728`（偏红偏重）改为 `#1f1611`（暖黑，消除背景抢眼问题）；② TopBar `--we-topbar-bg` / `--we-topbar-dropdown-bg` 从 `#3d2e22` 改为 `#18110c`（比页面大背景再暗一阶，恢复层级感）；③ TopBar 激活态背景从 `rgba(201,168,90,0.08)` 升至 `0.14`（激活标签可感知高亮）；④ shadow token 里的 3 处 legacy alias 替换为语义 token（`--we-color-accent-deep` → `--we-color-accent-deep`、`--we-color-bg-muted` → `--we-color-bg-muted`、`--we-color-border-default` → `--we-color-border-default`）；⑤ 卡片皮肤中 `--we-card-bg` / `--we-panel-card-bg` 的 legacy 别名同步替换为语义 token；⑥ `--we-card-radius` 从 `radius-sm`（6px）升至 `radius-md`（8px）；⑦ `--we-panel-card-shadow` 将 `color-mix()` 替换为等效 `rgba`，消除旧版浏览器兼容问题；`tokens.css` 中同位置补充 fallback 行；⑧ `theme.css` 顶部新增关键语义色最终解析值注释。

- fix(assistant): 修复 5 处写卡助手 UX 问题。① `useAssistantStore` 加 `pendingUserMessageId` 守卫：`replaceTailWithUser` 写入时记录 ID，`MESSAGES_CHANGED` 处理时若服务端数组不含该 ID 则把 pending 消息追加回去（防止 truncate 广播与 abort 竞态吞 user 气泡）；`DELTA` / `USER_MESSAGE` / `TASK_CREATED` 到达后清除守卫。② `AssistantPanel` 新增 `handleRegenerateLastUser`：在 `failed` 状态的错误横幅加"重新生成"按钮，找到最后一条 user 消息并 truncate 重发，解决卡在工具调用时无法重新生成的问题。③ `MessageList.UserEntry.confirmEdit` 放宽条件，点击"确认"无论内容是否变化均触发 `onEdit`，从而自动重新生成。④ `awaiting_approval` 区域布局重排：textarea 独占一行，"确认执行"/"拒绝计划"/"按建议修改"三个按钮合并到同一行。⑤ `parent-agent.js` 新增子代理失败误报检测：`TERMINAL` 信号处理和直接文本输出路径均在 `finalizeCompleted` 前检查 `task.lastSubagentResult.success === false`，若模型仍声称成功则改为 `pauseForRecoverableHarnessIssue`，提示用户子任务失败并暂停等待介入。

- refactor(frontend): 精简 `frontend/src` 顶层目录到 `core / pages / components / themes / shells`。把 `api/`、`hooks/`、`store/`、`utils/` 收进 `core/`，路由组合与壳选择落到 `core/router/`，全局状态落到 `core/state/`，设置/provider 常量落到 `core/constants/`；把页面布局契约 `PageLayout` / `EditPageShell` 移到 `pages/layout/`；把核心 CSS 与 token 默认值从 `styles/` 改到 `themes/`；`AvatarUpload` 回归 `components/ui/`。保留 `shells/` 外壳扩展边界，根目录 `/themes` 与 `/data/themes` 运行时主题语义不变。同步更新生产代码、assistant 前端接入边界与测试 import，删除未引用的 `frontend/src/assets/*`、`App.css` 和迁移后 `.gitkeep`。文档同步 `CLAUDE.md`、`ARCHITECTURE.md`。验证：`cd frontend && npm run lint`、`cd frontend && npm run test`、`cd frontend && npm run build`。

- fix(assistant): 连续工具失败时主动暂停等用户介入，避免无意义反复重试刷屏。父代理工具循环里若同一轮内连续 ≥3 次失败，立即抛 `ToolLoopControlSignal(PAUSED)` 终止循环，并向用户输出"刚才 X 连续失败 N 次，请告诉我下一步怎么处理（修改参数 / 跳过 / 调整计划）"。`assistant/server/tools/adapter.js` 的 `wrapToolEvents` 新增 `opts.afterCompleted({success, error, name})` 钩子（同时覆盖正常返回与 throw 两条路径，允许在钩子中抛 `ToolLoopControlSignal` 中断循环）；`assistant/server/task-store.js` 增加 `bumpConsecutiveFailure / resetConsecutiveFailure`；`assistant/server/parent-agent.js` 在 `buildToolRegistry` 装配熔断钩子（阈值 `CONSECUTIVE_FAILURE_PAUSE_THRESHOLD = 3`），并在新一轮 user turn 开始时重置计数。新增 4 个单测覆盖 afterCompleted 双路径调用、PAUSED 信号穿透、计数器累加 / 清零。

- fix(assistant): 修正 adapter 严格 success 判定误伤读取类工具。前一版把成功条件改为 `result.success === true`，但 `preview_card` / `read_file` / `list_resources` 返回的是数据载荷（字符串 / JSON / 对象）而非 success 契约，结果所有读取调用被显示为"失败"气泡。新策略：result 是含 success 字段的对象时走严格契约（写入类 apply_* / meta 工具），否则视为读取 payload，只要没 throw 就判成功。`tests/tools/adapter.test.js` 拆成两个测试覆盖两类工具。

- test(assistant): 补 UX 审计 P0+P1 单测。`adapter.test.js` 新增严格 success 判定：返回字符串 / undefined / `{ok:true}` / null / 缺 success 字段时一律失败。`sub-agent.test.js` 提取 `summarizeSubagentText` 并测三种路径（普通截到 1500、错误关键词全保留、空安全）。`task-store.test.js` 覆盖 `markPreviewed / hasFreshPreview` 命中、TTL 过期与未知 taskId 安全。`parent-agent.test.mjs` 补 `extractHardConstraints` 抽取与去重、`buildEmptyReply/ClaimedExecution/ProviderError` 文案不再含技术术语；新增两个 `replace_steps` 端到端测试：保留 intent / assumptions / createdAt、校验失败拒绝写入。`assistant/server/sub-agent.js` 把截断逻辑独立成 `summarizeSubagentText` 并导出 `__testables.summarizeSubagentText`；`parent-agent.js` 暴露 `extractHardConstraints / buildEmptyReplyRecoveryMessage / buildClaimedExecutionRecoveryMessage / buildProviderErrorRecoveryMessage`。

- fix(assistant): 收敛 agent loop UX 审计 P1（体验打磨）。`assistant/server/sub-agent.js` 把子代理总结截断从 400 字提到 1500 字，命中"错误/失败/不存在/校验"等关键词时整段透传，避免修复建议被截掉。`assistant/server/tools/meta/runtime.js` 删除 `finalize_task`，统一走 `reply_to_user` 收尾；`assistant/server/tools/meta/index.js` 同步移除导出，删除 `finalize-task.js`；`assistant/client/MessageList.jsx` 移除 `finalize_task` 文案/emoji；`tests/tools/meta-schemas.test.js` 与 `parent-agent.test.mjs` 改为 4 件套校验。三处恢复文案（empty reply / claimed execution / provider error）改为面向用户的友好措辞，不再露"模型调用 / 子代理执行记录"术语。`MessageList.jsx` 加入 STICKY_BOTTOM_THRESHOLD_PX 滚动检测：用户上翻 >200px 后新消息不再强制滚到底部，改为右下角"↓ 新消息"按钮。`AssistantPanel.jsx` 在 SSE 流接收到 `AWAITING_APPROVAL` / `PAUSED` 时立即把 `isStreaming` 置 false，停止按钮的常驻问题消失；`handleStop` 改为"请求取消"流程，先 abort、再 cancelTask、再 fetchTask 拿权威终态，避免本地 TASK_CANCELLED 覆盖刚到的 TASK_COMPLETED。`assistant/server/task-store.js` 新增 `markPreviewed / hasFreshPreview`（task 级、30s TTL），`sub-agent.js` 接收 `taskId` 后跨步骤命中同实体的 preview 缓存，跳过重复 preview。`parent-agent.js` 摘要前调用 `extractHardConstraints` 抽取用户消息中的字段名 / ID / 命名约定 / "必须·禁止"指令，作为"不可省略的硬约束"附在 LLM 摘要后，避免 6 行摘要丢决策点。`PlanDocViewer.jsx` 新增顶部"已完成 N/M + 进度条"展示，已完成行加灰色+删除线；进度条用 transition 平滑过渡。`tests/routes-http.test.js` 新增三个集成测试：`/agent/recover` 按 context 严格匹配 / `/recoverable-tasks` 排除当前 context / POST `/agent` 跨上下文 409。

- fix(assistant): 收敛 agent loop UX 审计 P0（数据完整性 / 跨上下文隔离 / 误伤）。`assistant/server/plan-doc.js` 的 `STEP_RE` 兼容半角/全角括号与多余空格，`parsePlanDoc` 现可提取 `intent / assumptions / createdAt / updatedAt`；`renderPlanDoc` 增加 `updatedAt` 字段。`assistant/server/tools/meta/runtime.js` 中 `edit_plan_doc.replace_steps` 保留原 `intent / assumptions / createdAt`，仅刷新 `updatedAt`，并在渲染后调用 `validatePlanDoc` 拒绝畸形结构。`assistant/server/tools/adapter.js` 把 success 判定改为严格 `result.success === true`，所有 meta 工具与 `reply_to_user` 的返回从 `{ok}` 统一为 `{success}`（含 `dispatch_subagent` 描述、`lastSubagentResult.success`）；apply 工具沿用既有 `{success}` 形态。`assistant/server/task-store.js` 的 `getLatestRecoverableTask(context)` 严格按 `worldId / characterId` 匹配，无匹配返回 null，新增 `listRecoverableTasks({ excludeContext })`；`/api/assistant/agent/recover` 接收 `worldId / characterId` 查询参，新增 `/recoverable-tasks` 列表，POST `/agent` 在跨上下文请求时返回 409。前端 `AssistantPanel.jsx` 调用 `recoverTask` 时透传当前 world/character；找不到任务时 toast 提示"其它世界还有 N 个未完成任务"。`assistant/server/parent-agent.js` 的 `claimedExecutionWithoutRealAction` 仅在本轮存在 tool_call 时启用（纯解释回复不再误伤），`detectPlanFirstPolicy` 增加 PURE_QUERY 旁路，"完整地展示一下我的角色卡"等纯查询不再触发 plan-first。新增/更新单测覆盖上述变更。

- fix(assistant): 写卡助手不再把 `reply_to_user` 当作工具气泡渲染。`assistant/client/MessageList.jsx` 在 `tool_call` 分支增加 `toolName === 'reply_to_user'` 跳过逻辑：该工具仅作为模型本轮收尾通道，气泡本身没有信息量，且其 message 内容已通过 assistant 消息呈现，避免在终态前多出一行没有标签翻译的 `reply_to_user` 块。

- fix(frontend): 收敛聊天/写作页的 UX 硬伤与静默失败。`InputBox` 现在会保存未发送草稿、阻止规则处理后为空的发送、附件读取失败时明确提示，并在 AI 代写覆盖已有输入前要求确认且避免强制滚动抢焦点；`ChatPage`/`WritingSpacePage` 切会话时会清掉 pending diary injection、续写 token 和旧流引用，避免跨会话污染；`StatePanel`/`NearbyPanel` 改成仅在成功拉到日记正文后才高亮注入条目；`MessageList`、`SessionListPanel`、`useSessionState`、写作页初始化链路新增明确的加载失败态与重试入口；`stream-parser` 对 malformed SSE 事件改为记录 warn，不再完全静默；`ErrorBoundary` 文案改为提示刷新后尝试恢复本地草稿。新增前端回归：`frontend/tests/components/input-box.test.jsx`、`frontend/tests/api/stream-parser.test.js`，并扩充 `chat-page`、`writing-space-page`、`use-session-state` 测试覆盖。

- fix(assistant): 子代理失败通知改为 assistant 消息气泡 + 提高子代理成功率。① `sub-agent.js` `summarizeSubagentText` 剥除 `<think>...</think>` 块（含多行变体），避免模型推理原文污染回传给父代理的摘要和错误文案；② `tools/meta/runtime.js` `dispatch_subagent` 检测 task 字段以中/英文冒号结尾（LLM 截断特征），立即返回 `success:false` 并要求补全，不再白跑一次 LLM；③ `parent-agent.js` 新增 `pauseSubagentFailed` 函数：子代理失败时改用 `streamAssistantText` 输出 assistant 气泡（支持 ThinkLine 折叠），而非 STEP_STARTED/STEP_FAILED 工具条目（step title 无法折叠 think 块）；两处调用子代理失败路径均切换到新函数，并在 errDetail 做二次 think 块清洗。

- fix(assistant): `PlanTaskHud` 显示优化：① 任务文本剥去 `**step-n**` 前缀（正则 `/^\*{0,2}step-\d+\*{0,2}\s*/i`），只展示正文；② 当前执行项的 ▶ 三角标替换为 `we-hud-spinner` 转圈动画（复用 `we-tool-spin` keyframe，主色 `var(--we-color-accent)`）；③ 行对齐从 `items-start` 改为 `items-center`，与 spinner 等高对齐。

- fix(assistant): `awaiting_approval` 审批区布局调整：textarea 修改建议输入框与"确认修改"按钮（原"按建议修改"）合并到确认执行/拒绝计划同一行，删除独立的 textarea 区块，输入框 `flex-1` 填充中间剩余空间，所有按钮加 `flex-shrink-0`。

- fix(assistant): 修复两处写卡助手 bug。① user 消息气泡被吞：`AssistantPanel.handleSend` 中 `abortRef` / `AbortController` / `setIsStreaming(true)` 移到任何 `await` 之前同步执行，React 18 将 `beginUserTurn(status:'running')` 与 `setIsStreaming(true)` 批量合并，recovery `useEffect` 看到 `isStreaming:true` 直接跳过，不再用服务端快照覆盖本地刚写入的 user 气泡；`buildContext()` 下移至 `try` 块内。② 拒绝计划后点"重新生成"直接执行任务：`/agent/:taskId/truncate` 路由改为 async，截断前记录是否存在 `plan_doc` 消息，若截断后 plan_doc 消息被移除则同步清空 `planDocContent` / `approvalCheckpoint` 并删除 plan doc 文件，再广播 `PLAN_DOC_UPDATED(content:'')` 事件，确保重新生成时 `parent-agent` 读到空 plan doc 并重走 `write_plan_doc` 流程。

- fix(assistant): 修复拒绝计划后又被静默恢复成新计划，并删除计划文档底部空“执行日志”。`POST /agent/:taskId/reject` 现在会清空审批 checkpoint，并把任务切到 `paused + error='plan rejected by user'`；`AssistantPanel` 识别该暂停原因，只恢复快照和输入态，不再自动 `resume:true` 触发父代理重跑。计划文档模板移除“执行日志”小节，`edit_plan_doc` 也删除 `append_log` 操作，避免审批前出现无意义尾段。同步 `SCHEMA.md` / `ARCHITECTURE.md`，更新 `assistant/tests/plan-doc.test.mjs`、`assistant/tests/parent-agent.test.mjs`、`assistant/tests/routes-http.test.js`。

- docs(agent): 调整入口执行规则，测试无需再向用户逐项确认。`CLAUDE.md` 新增“自动测试确认”：任务完成后由 agent 根据改动范围自行判断并执行必要的单元/集成/e2e 测试，默认预期全部通过；若存在允许失败项，必须在回执说明原因、范围和后续处理；测试结束后清理本次测试产生的 `/.temp/` 临时文件。`AGENTS.md` 仍只作为镜像入口，不承载独立正文。

- fix(assistant): 去掉写卡助手输入框右侧原生滚动条。`assistant/client/InputBox.jsx` 保持自动增高上限，但把内部 `textarea` 从可见 `overflow-y-auto` 改为隐藏滚动条，恢复底部输入区的干净视觉。

- fix(assistant): 修复拒绝 plan 后输入框被封死，并收敛其它误阻塞输入的状态。此前前端审批区“取消”按钮复用了 `/agent/:taskId/cancel`，后端会把任务切到 `cancelled`，而输入框又把 `cancelled / failed` 当成不可继续，导致用户拒绝计划后无法继续聊天。现在新增 `POST /agent/:taskId/reject`：仅删除当前 plan doc 与对应 `plan_doc` UI 消息，任务切到 `paused` 并下发 `messages_changed + paused + task_snapshot`；前端按钮改为“拒绝计划”并调用该接口。`AssistantPanel` 同步取消基于 `failed/cancelled` 的输入禁用，因后端本就支持在 paused / completed / failed / cancelled 上同一 task 续聊；真正停止执行仍走“停止/清空”。拒绝计划成功后前端会主动 abort 旧审批订阅并恢复发送态，且不再在终态重开面板时清空 `taskId`，确保 completed / failed / cancelled 也能按同一任务续聊。补 `assistant/tests/routes-http.test.js` 回归覆盖拒绝计划后可继续对话。同步 `ARCHITECTURE.md`。

- fix(assistant): 修复计划文档“假设与约束”显示 `[object Object]`。`write_plan_doc` 的 schema 虽声明 `assumptions` 为字符串数组，但模型偶发会传对象数组；旧版 `renderPlanDoc()` 直接模板字符串拼接对象，导致审批计划里出现不可读的 `[object Object]`。现在 `assistant/server/plan-doc.js` 在 Markdown 出口统一清洗宽类型输入：优先取 `text/content/fact/assumption/constraint/description/summary/title/name/value` 等字段，带 `source/from/ref` 时附加来源，兜底展开对象键值；`assistant/server/tools/meta/runtime.js` 在工具入口提前规整 assumptions。补 `assistant/tests/plan-doc.test.mjs` 回归覆盖对象形态假设。并已修复当前 `task-fc58e933` 的落库计划快照，抽屉刷新后不再显示 `[object Object]`。

- fix(assistant): 修复写卡助手“回复完成后按钮仍停在停止”的假运行态。根因是前端 `consumeSseResponse()` 只等网络 EOF 才 resolve；即使后端已经发出 `{ done:true }`，只要 SSE 连接没有及时关闭，`AssistantPanel.handleSend()` 的 `finally` 就不会执行，`isStreaming` 一直为 true，输入框按钮停留在“停止”。现在 parser 收到 `done:true` 后会主动 `reader.cancel()` 并返回，立即触发 `setIsStreaming(false)`；同时补 `frontend/tests/assistant/api.test.js` 用未关闭的 ReadableStream 模拟“done 已到但连接不 EOF”的回归。验证：`cd frontend && npx vitest run tests/assistant/api.test.js`；`node --test assistant/tests/use-assistant-store.test.mjs assistant/tests/parent-agent.test.mjs assistant/tests/routes-http.test.js`。

- fix(assistant): 从根源降低“上一轮 agent 出错”触发率。根因是父代理要求模型必须用 `reply_to_user` 工具收尾，但服务端还保留了 `completeWithTools` 普通文本兜底；当模型空返、provider 抛错、或只在文本里说“已派发/正在执行”但没有真实 `dispatch_subagent` 记录时，旧逻辑统一写成 `failed + agent loop error`，前端就会弹“上一轮 agent 出错”，且容易让后续对话卡在失败态。现在这些 harness 层可恢复问题改为 `paused`：服务端追加一条不误报完成的说明性 assistant 消息，发 `paused + task_snapshot + done` 并关闭本轮 SSE，用户可立即继续输入；只有模型显式 `reply_to_user({status:"failed"})` 的业务失败才保留 `failed`。回归更新 `assistant/tests/parent-agent.test.mjs` 覆盖空回复、口头宣称执行、provider 抛错三条可恢复暂停路径。验证：`node --test assistant/tests/parent-agent.test.mjs`。

- fix(assistant): 修复写卡助手软失败、完成态重连 toast 与动态省略号时机。`assistant/client/AssistantPanel.jsx` 不再把 `completed / cancelled` 快照重连当成需要提示的恢复事件，`agent loop error:` 软失败只放开输入、不再反复弹“上一轮 agent 出错”；用户在同一 task 上继续发送时，前端先本地进入 `running`，让主代理响应等待期的 `...` 从第二轮起也能出现。`assistant/server/parent-agent.js` 在每轮 `runParentAgent` 真正切到 `running` 后补发 `task_snapshot`，保证重连、软失败续聊和多端订阅都能把本地状态回切到真实运行态。同步 `ARCHITECTURE.md`。验证：待用户确认后建议运行 `node --test assistant/tests/use-assistant-store.test.mjs assistant/tests/parent-agent.test.mjs assistant/tests/routes-http.test.js`；并手动验证已完成任务重连无 toast、软失败后可直接追问、第二轮发送到首个主代理回复前显示动态 `...`。

- fix(assistant): 写卡助手 planning policy 升级为通用闸门。此前父代理 prompt 把 plan 过度描述为可选，导致创建玩家卡/角色卡只填姓名简介人设、不覆盖初始状态；批量状态值也常被一次性派给单个子代理，字段多时容易漏填。现在 `assistant/prompts/parent-agent.md` 与 `assistant/knowledge/CONTRACT.md` 明确：高风险删除/清空/覆盖、跨资源任务、从零创建世界/玩家/角色核心卡片、状态字段/状态值/Prompt 条目/lore 体系、完整/全套/批量/补全/整体优化类请求必须先 `write_plan_doc`；计划需按真实依赖拆出读取确认、字段/条目定义、创建/定位、分组写值、核对验收。运行时 `parent-agent.js` 增加通用 plan-first 检测与 context 提示，`dispatch_subagent` 在未写计划时会拒绝复杂/高风险/结构化体系任务的直接派发；状态值 step 限定每组 3-5 个字段并要求列出 field_key/label/type/value_json；`appliedResources` 记录 stepId 便于追踪计划步骤。同步 `ARCHITECTURE.md`。验证：待用户确认后运行 `node --test assistant/tests/parent-agent.test.mjs`。

- fix(assistant): 写卡助手"删除/截断单条消息失败"不再阻塞用户输入。`assistant/client/AssistantPanel.jsx` 中 `handleDelete` / `handleEdit` / `handleRegenerate` 之前在 `apiDeleteMessage` / `apiTruncateFrom` 抛 400/404 时统一 `ingestEvent({ type: TASK_FAILED, ... })`，把整个 task 推入 failed 终态，输入框随之锁成"任务不可继续，点击「清空」开始新任务"。典型触发：任务还在 running 时点删除用户消息 → 后端 routes.js 返回 400 `cannot delete while running` → 前端把它当成致命错误把任务标失败。改为只走 `log.warn(..., { toast })` 提示并 `return`，本地状态不变；任务自身还在跑或可继续，输入框照旧可用。验证：写卡助手抽屉中 running 状态点删除用户消息 → 出现 toast "cannot delete while running"，输入框保持可输入。
- fix(assistant): 降低子代理失败率(写卡助手 harness 第二轮)。两类高频失败被堵在源头:**(a) 跨资源边界的任务在父代理层拆解**:`assistant/prompts/parent-agent.md` 新增"任务拆解原则"段,明确"状态字段定义只能在 world-card 上;给 persona/character 新增字段并填值,必须拆成 world-card.update(stateFieldOps) + persona-card.update(stateValueOps) 两次 dispatch_subagent;缺字段时不要硬上 update 值,先派一个 world-card 步骤补齐"。这条直接对应用户反馈的失败场景("改 persona 姓名 + 创建状态字段",原先父代理把两件事打包给一个 persona-card.update 子代理,但 persona-card 不支持 stateFieldOps,sub-agent 必然连续报错)。**(b) sub-agent preview 闸门**:`assistant/server/sub-agent.js` 在 apply 工具 wrapper 前加 `previewedThisRun` 标记 —— 当 operation 是 update/delete 且本轮 `preview_card` 一次都没调用过,直接返回 `{ success:false, error:"请先 preview_card(...) 拉取当前数据再 apply" }` 而**不执行 apply**;模型读到这条工具反馈后自然会先 preview。这堵住了"瞎猜 ID / 用过时字段名 / 不知道现有字段就乱填" 的最大一类失败来源。回归:`assistant/tests/sub-agent.test.js` 新增"没 preview 直接 apply → 被闸门拦"和"先 preview 再 apply → success=true"两条。验证:`node --test assistant/tests/sub-agent.test.js`(11/11)、`npm run test:backend`(481/0/3)、`npm run lint`。
- fix(assistant): 修复子代理"模型谎报已完成"问题。先前 `assistant/server/sub-agent.js` 只看 LLM 输出的总结文本来判定成功/失败 —— 当 sub-agent 内的 `apply_*` 工具连续报错、LLM 仍在最后一轮输出"已经完成更新"之类的虚假总结时，`dispatchSubAgent` 会回 `{ success:true, summary:"已完成" }`，父代理误以为落库成功并向用户报喜，用户看到的实际效果却是状态/字段毫无变化。改造 sub-agent 加 `applySuccessCount` 计数器：apply 工具的 wrapper 在 `success !== false` 时才 +1，并记录最后一次 apply 错误（`lastApplyError`）；LLM 工具循环结束后若 `applySuccessCount === 0`，强制返回 `{ success:false, error:"子代理未成功落库（<apply 工具名> 最后一次错误：<x>）；模型自述：<summary>" }`，把"模型怎么说"和"实际有没有落"分开。同步加强 `assistant/prompts/parent-agent.md` 硬约束："若 `# 本轮已落地变更` 中没有对应资源、或最近一次子代理结果是 error，不允许在 `reply_to_user` 里告诉用户已完成"，并要求改入参或换策略而不是同入参死磕重派。回归：`assistant/tests/sub-agent.test.js` 旧用例"调用 mock LLM 完成一次（无 tool 调用）"原本验证的就是这个 bug 行为，已改为反向断言（success=false 且 error 含模型自述）；新增"至少一次 apply 成功 → success=true"覆盖正常路径。验证：`node --test assistant/tests/sub-agent.test.js`、`npm run test:backend`（481/0/3）、`npm run lint`。
- fix(assistant): 修复写卡助手“重新生成”在 assistant 消息前夹有 `tool_call` / `step` / `plan_doc` 时失效的问题。此前 `assistant/client/AssistantPanel.jsx` 直接把目标 assistant 的上一条消息当作 source user，遇到工具流记录就会早退，点击按钮无任何效果；现改为通过 `assistant/client/message-helpers.js#findRegenerateSource()` 向前跳过非对话消息，找到最近一条有效 user 后再执行 truncate + resend。新增 `assistant/tests/message-helpers.test.mjs` 覆盖“跳过工具/计划消息”和“遇到上一轮 assistant 立即停止、防止串轮”两条回归。验证：`node --test assistant/tests/message-helpers.test.mjs assistant/tests/use-assistant-store.test.mjs`。

- refactor(assistant): 写卡助手 harness 健壮性优化。彻底废掉"单 JSON action 文本协议"——`assistant/server/parent-agent.js` 不再用 `llm.complete` + `parseDecision`/`extractJsonCandidate` 解析模型每轮回复，而是回归原生 tool-calling（`llm.completeWithTools`），每个 user-turn 一次性下发完整工具集，让 provider 内部跑 tool-use 循环。删除 `parseDecision` / `requestSingleAction` / `executeAction` / `ACTION_TYPES` / `MAX_INVALID_ACTIONS` / `decisionFeedback` 一整套，删除"两次 ACTION_INVALID 立刻 failLoop"导致一错即锁的失败路径。父代理工具集**移除 `apply_*` 系列**（只对子代理暴露）：任何资源新增 / 修改 / 删除必须走 `dispatch_subagent`；新增终态工具 `reply_to_user(message, terminal?, status?)` 作为唯一收尾入口，模型自然回复纯文本时也按 `completed` 收尾。`assistant/server/task-store.js` 新增内存级 `appliedResources: []` + `recordAppliedResource` / `findAppliedResource` / `clearAppliedResources`：每新一轮 user 输入清空；`dispatch_subagent` 在 operation=`create` 且无 `force:true` 时若发现同 `targetType` 的 create 记录直接拒绝，根治"建一张玩家卡却连建好几张"；子代理通过 `onApplied` 回调把落地资源写回父任务列表，`buildContextBlock` 注入 `# 本轮已落地变更` 段位给模型看到。新增"harness 软失败"：provider 抛错 / 空文本返回 / 未捕获异常一律走 `softFail`，把 `task.error` 标成 `agent loop error: ...` 前缀；前端 `AssistantPanel` 识别该前缀**保持输入框可用但不自动重订阅 SSE**（区别于服务重启的 `interrupted by restart`），用户可在同一 task 上继续追问。`runParentAgent` 启动时统一 drain `pendingUserMessages`，避免用户在 idle/paused 间隙的话被吞。`assistant/prompts/parent-agent.md` 从 67 行精简为四段（能力分类 / 调用纪律 / 写计划时机 / 收尾规则），删掉手写的 6-action JSON 文法和工具名清单（schema 由 API 通道下发，prompt 不再罗列）。重写 `assistant/tests/parent-agent.test.mjs`：删 parseDecision/MOCK_LLM_ACTION 相关用例；新增 appliedResources 清空、dispatch_subagent 去重、reply_to_user 终态、HARNESS_ERROR_PREFIX 软失败、provider 抛错软失败、自然文本回复直收尾、pendingUserMessages 启动 drain 等 7 条新覆盖。同步 `ARCHITECTURE.md §14` 写卡助手段落。验证：`npm run test:backend`（481 pass / 0 fail / 3 skip）、`npm run test:frontend`（162 pass）、`npm run lint`（全绿）。
- feat(assistant): 将写卡助手父代理从“单轮 tool loop + planning/executing 阶段机”重构为显式 agent loop。`assistant/server/parent-agent.js` 现在按轮次重组上下文并多轮调用模型：读资源后可继续思考、继续读、直接 apply、直接 `dispatch_subagent`，或选择 `write_plan_doc` 挂起到 `awaiting_approval`；不再把 plan/subagent/apply 绑死在预设阶段。`assistant/server/routes.js` 同步改成围绕 `running / awaiting_approval / paused / completed / failed / cancelled` 恢复 loop，终态任务也可在同一 task 上继续对话，`approve` 只恢复被 plan 挂起的 loop。`assistant/server/task-store.js` 与 `assistant_tasks` 新增 `last_tool_failure_json` / `last_subagent_result_json` / `approval_checkpoint_json` / `loop_iteration` 持久化字段，前端 `AssistantPanel` / `useAssistantStore` 去掉 `planning/executing` 语义，统一按 `running` 驱动。补充回归：读后再答、工具失败后二轮解释、空收口失败。同步 `SCHEMA.md` / `ARCHITECTURE.md` / `assistant/knowledge/CONTRACT.md` / `assistant/prompts/parent-agent.md`。验证：`node --test assistant/tests/parent-agent.test.mjs assistant/tests/routes-http.test.js assistant/tests/task-store.test.js assistant/tests/task-store-hydrate.test.js assistant/tests/use-assistant-store.test.mjs`。

- fix(backend startup): 修复 `session_stream_tasks` 表在 hydrate 时尚未建好的启动顺序 bug。`backend/services/session-stream-task-store.js` 之前在模块顶层调用 `hydrate()`，但 server.js 顶部 `import './routes/chat.js'` 链路会先把该模块拉进来，ESM 顶层 import 全部先于 `initSchema(db)` 求值，结果 `listSessionStreamTasks()` 在建表前查询、抛 `SqliteError: no such table: session_stream_tasks`（`backend/tests/server-hooks.test.js` 也因此挂）。改为导出 `hydrateSessionStreamTasks()`，由 server.js 在 `initSchema(db)` 之后、`loadUserHooks()` 之前显式调用。同时把上一条遗留的 `backend/tests/routes/chat.test.js` 客户端 cancel 用例与新行为对齐：测试名改为"服务端继续完成并落库"，等待时长 250ms→600ms 让两段 chunk 跑完，断言改为同时包含两段、不含 `[已中断]`、`activeStreams` 已清空。验证：`npm run test:backend`（481 pass / 0 fail / 3 skip）。

- fix(chat/writing resume): 修复 Codex review 标出的两个 P1 bug。**Bug 1**（跨任务事件串流）：`emitSessionStreamEvent` 之前仅按 `sessionId` 广播，同一 session 上若旧流尚未发完终态事件就启动新流（如用户连点发送/重试），旧流的 `aborted`/`error` 会落到新连接，意外把新生成标成中断。改造为按 `taskId` 关联 SSE 客户端：`attachSessionStreamSse(sessionId, taskId, res)` 记录归属；`emitSessionStreamEvent(sessionId, payload, { taskId })` 把"对内存任务的写入"与"对客户端的广播"拆开 —— 旧 taskId 的事件不会写到已被替换的新 task 上，但仍会送达旧 taskId 的客户端；`closeSessionStreamSse(sessionId, taskId)` / `completeSessionStreamTask(sessionId, taskId)` / `failSessionStreamTask(sessionId, error, taskId)` 同步按 taskId 收敛，旧运行不会再关掉新连接或覆盖新状态。`createSessionStreamTask` 返回的 task 透出到 runner，runner 把 `attachSse(task)` 回调暴露给路由层（路由不再预先 attach），同一处统一把 `taskId` 注入 emit 闭包，保证 runner 内部所有 emit/close/complete/fail 都带正确 taskId。**Bug 2**（恢复时丢失中间 token）：之前前端先 `GET /recover-stream` 拿快照、再 `GET /stream` 订阅；两次请求之间产生的 delta 会被丢掉（`/stream` 一连上就推送 `stream_snapshot`，但 `parseSSEStream` 没识别这个事件）。`stream-parser.js` 增加 `stream_snapshot` 事件类型，回调暴露 `onStreamSnapshot(task)`；`ChatPage.recoverLiveStream` / `WritingSpacePage.recoverLiveStream` 订阅时把 `onStreamSnapshot` 接到 `applyRecoveredSnapshot`，首条事件就用 `/stream` 返回的最新快照覆盖一次，正好抹平两次请求之间的窗口。同时把 `/stream` 端点改为只接 `getRecoverableSessionStreamTask`（terminal-completed 不再可订阅，避免误连旧任务）。配套：`backend/tests/utils/post-gen-runner.test.js` 适配 `onAllSettled` 回调新签名（旧版断 `res.end()` 会导致测试在新 API 下死等）。验证：`node --test backend/tests/routes/stream-helpers.test.js backend/tests/services/session-stream-task-store.test.js backend/tests/utils/post-gen-runner.test.js backend/tests/routes/writing.test.js`、`node --test backend/tests/routes/chat.test.js`（17/18 通过；剩 1 条仍是功能 PR 移除"浏览器 close 即 abort"行为后未同步的旧测试，与本次 fix 无关）、`cd frontend && npx vitest run tests/pages/chat-page.test.jsx tests/pages/writing-space-page.test.jsx`、`npm run lint:backend`、`npm run lint:frontend`。

- refactor(chat/writing resume): simplify pass。后端：`backend/services/session-stream-task-store.js` 在 delta 事件上不再做整行 UPSERT（重编码 `messages_json`），改走新增的 `updateSessionStreamProgress` 列定向 UPDATE，仅写 `streaming_text` / `continuing_text` / `updated_at`，把 N-token 流的写放大从 O(N) 整行重写降为 O(N) 单列更新；终态任务 60s 后从内存 Map 中淘汰（保留 DB 真相源），避免长时间运行的服务无限累积 `messages` 副本。`RESTART_INTERRUPTED_ERROR` 提升到 `shared/runtime-constants.mjs`，前后端共享，前端 `ChatPage` / `WritingSpacePage` 替换为常量比对；`emitSse(_res, sid, ...)` 收紧为 `emitSse(sessionId, payload, options)`，路由调用同步去掉传给 `runChat*Stream` / `runChatRegenerate` / `runWriting*Stream` / `runWritingRegenerate` 的废 `res` 参数；`endResponse: true` 出参重命名为 `stopLifecycle: true`（`res.end()` 早已不在此分支调用，旧名字误导）。前端：`subscribeSse` 收敛到 `frontend/src/api/stream-parser.js`，`api/chat.js` 与 `api/writing-sessions.js` 不再各写一份；`parseContinuationText` 收敛到 `utils/next-prompt.js`，两个页面去掉本地重复定义。验证：`node --test backend/tests/services/session-stream-task-store.test.js backend/tests/routes/stream-helpers.test.js`、`cd frontend && npx vitest run tests/pages/chat-page.test.jsx tests/pages/writing-space-page.test.jsx`、`npm run lint:backend`、`npm run lint:frontend`。残留：`backend/tests/routes/chat.test.js` 中两条断言旧"浏览器 close = abort"行为的用例与该功能 PR 引入的新 SSE 生命周期语义冲突，本次未修复（属功能 PR 的测试漂移，CHANGELOG 顶部说明已声明该行为变更）。

- refactor(backend): 移除 `backend/routes/stream-helpers.js` 中已彻底失效的旧 SSE 直连 helper（`setSseHeaders` / `sendSse` / `beginStreamSession`），并清理 `backend/routes/chat.js`、`backend/routes/writing.js` 里不再使用的历史 import。断点续传切到 session 级 broadcaster 后，后端不再保留“浏览器 close 即 abort 当前流”的旧入口，避免后续误用两套流生命周期模型。验证：`rg -n "beginStreamSession|setSseHeaders\\(|sendSse\\(|isClientClosed\\(" backend` 无结果；`node --test backend/tests/routes/stream-helpers.test.js backend/tests/routes/chat-routes.test.js backend/tests/services/session-stream-task-store.test.js`；`npm run lint:backend`。

- test/fix(chat/writing): 为断点续传补齐 recover 回归测试，并清理流任务迁移后的旧 `isClientClosed` 死路径。新增 `backend/tests/services/session-stream-task-store.test.js`，覆盖普通流 delta 持久化、continue 持久化 `continuingText`、`done -> postprocessing -> completed` 状态流转；`frontend/tests/pages/chat-page.test.jsx` 与 `frontend/tests/pages/writing-space-page.test.jsx` 补充页面进入 session 后自动 recover + 补订阅，以及 `interrupted by restart` 仅恢复快照不重连的用例。实现侧同步删掉 `chat/writing` 流编排里残留的 `streamState.isClientClosed()` 判断与共享 runner 中已失效的 `res.end()` 分支，避免旧测试路径在新 session 级 SSE 语义下抛 `TypeError`。验证：`node --test backend/tests/routes/chat-routes.test.js backend/tests/services/session-stream-task-store.test.js backend/tests/utils/post-gen-runner.test.js`、`npm run test:frontend -- chat-page.test.jsx writing-space-page.test.jsx`、`npm run lint:backend`。

- feat(chat/writing): 为 chat 与 writing 接入和写卡助手同语义的断点续传。后端新增 `session_stream_tasks` 表与 `backend/services/session-stream-task-store.js`，把流式生成改为 session 级任务真相源：普通生成持久化 `streaming_text`，continue 持久化 `continuing_message_id + continuing_text`，前端刷新后不再依赖页面内存。新增接口：`GET /api/sessions/:sessionId/recover-stream|stream` 与 `GET /api/worlds/:worldId/writing-sessions/:sessionId/recover-stream|stream`。浏览器断线不会直接杀掉后端流；后端重启时活跃流统一恢复为 `failed + interrupted by restart`，页面展示中断前内容并给 toast 提示。前端 `ChatPage` / `WritingSpacePage` 进入当前 session 后会自动 recover，并在成功重连、重启中断、恢复失败时补 toast。验证：`npm run test:frontend -- chat-page.test.jsx writing-space-page.test.jsx`、`npm run lint:frontend`、`npm run lint:backend`、`cd frontend && npm run build`。

- style(frontend): 去掉可编辑字段值的金色虚线下划线。`.we-status-editable` 移除 `border-bottom: 1px dashed`，仅保留 hover 时颜色由 ink-secondary → color-gold 的提示；点击编辑入口仍可发现（依赖 hover 颜色 + 现有 hover 提示气泡）。

- fix(frontend): writing 右栏 actions 浮动定位锚点修正。`.we-cast-card .we-section-tabs-bar` 改为 `position: relative`，`.we-section-tabs-actions` 由 `top: 38px`（相对 cast-card）改为 `top: calc(100% + 14px)`（相对 tabs-bar 底部 + content 上 padding 14px ≈ 人设 label 顶部），让 chip 与"人设"首行对齐。

- style(frontend): writing 右栏取消第二行 actions，浮到 tab 内容右上角。`.we-cast-card { position: relative }`，`.we-section-tabs-bar > .we-section-tabs-actions` 改 `position: absolute; top: 38px; right: 0`，与首字段同行（附近角色第一行恒为 `人设`，玩家首字段强制全宽：`.we-cast-card .we-status-player .we-fields-list--grid > *:first-child { grid-column: 1 / -1 }`，并在 `NearbyPanel.jsx` 给 player StatusSection 补 `className="we-status-player"` 让规则命中）。chat StatePanel 走的是 inline globalActions slot 路径，未渲染 `.we-section-tabs-actions`，不受新规则影响。

- style(frontend): chat 右栏「重置」chip 上移到 tab 行同行。`SectionTabs.jsx` 增加 fallback：当未传 `globalActions` 时（chat 场景），per-tab `actions` 自动渲染到 tabs 行右侧的 `we-section-tabs-globals` 位，第二行 `we-section-tabs-actions` 不再生成；writing 场景仍有 `globalActions=+`，per-tab actions 维持第二行行为不变。视觉效果：chat 玩家/角色 tab 行末尾出现「重置」chip，原独占行删除。

- style(frontend): 角色 tab 行的全局 `+` 按钮去框透明化。`.we-panel-card-action--icon` 追加 `border-color: transparent` 与 `background: transparent`（含 hover 态），让仅图标的 chip（当前仅 NearbyPanel `+` 按钮使用）显示为裸图标，颜色仍走 chip 的 `--we-color-text-tertiary → --we-color-accent` hover 切换。

- style(frontend): 世界卡标题与角色 tab 行下方采用同款柔化渐变分隔线。`.we-panel-card--flush > .we-panel-card-header` 改为 `background-image: linear-gradient(...)` 1px 渐变（两端淡出），代替原 `border-bottom: 1px solid`；`.we-cast-card .we-section-tabs-bar` 追加同款渐变分隔线 + `padding-bottom: 4px`，让人名行（玩家/角色/日记 tabs）下方也有一致的横线视觉。颜色仍走 `--we-color-border-default`，未引入新色。

- style(frontend): 缩小世界卡下方留白。`.we-state-panel .we-panel-tab-body` / `.we-cast-panel .we-panel-tab-body` padding 由 `0 0 12px` 改为 `0`，让世界框与 fleuron 之间的间距收敛到 fleuron 自身的 8px margin。

- style(frontend): 右栏中间 fleuron 分隔线居中并对齐卡片边界。`.we-state-panel .we-cast-fleuron` / `.we-cast-panel .we-cast-fleuron` margin 由 `6px 12px 8px` 改为 `8px 0`，上下间距相等，左右与上下卡片边框平齐。

- style(frontend): 收紧 chat/writing 右栏世界/角色卡左右留白。`.we-state-panel .we-panel-tab-body` / `.we-cast-panel .we-panel-tab-body` 横向 padding 由 `0 12px 12px` 改为 `0 0 12px`；`.we-cast-card` margin 由 `0 12px` 改为 `0`。横向缩进收敛为仅 scroll 容器的 14px，整体看更紧凑。验证：`/chat?session=…` 与 `/writing?session=…` 世界框/角色框左右留白比之前小。

- style(frontend): 微调 chat 右栏世界卡视觉。①`.we-state-scroll` 追加 `padding: 14px`，让 chat StatePanel 顶部不再贴顶（与 writing `.we-cast-scroll` 一致）；同时让 `.we-world-frame` 与 `.we-cast-card` 在两个页面下的横向缩进对齐。②`.we-world-frame` / `.we-cast-card` 圆角由 `--we-radius-md`(8px) 降到 `--we-radius-sm`(6px)，与写卡助手气泡 `.we-asst-bubble--*` 对齐；追加 `--we-shadow-paper-lift` 环绕阴影。改动只触 `frontend/src/index.css`，未触主题层与组件结构。验证：`/chat?session=…` 右栏顶部留白且与 `/writing?session=…` 视觉一致；世界框与下方角色框圆角和阴影同步。

- fix(assistant): 修复写卡助手任务恢复的两个回归。`assistant/server/tools/meta/runtime.js` 现在会在每个 step 收尾同时消费 `takeUserMessages()` 和 `consumePauseAfterCurrentStep()`；因此最后一个 SSE 订阅者断开后，`task-store.js` 写下的 `pauseRequested` 不再是死标记，任务会在当前 step 结束后真实切到 `paused`，后续重连可从稳定断点恢复。前端 `assistant/client/AssistantPanel.jsx` 不再把 `completed` 当成输入禁用态，保留已完成任务的恢复快照同时允许用户直接继续发送下一条消息；`InputBox.jsx` 的终态占位文案同步改为只覆盖不可续聊的 `failed/cancelled`。补充测试：`assistant/tests/task-store.test.js` 覆盖断连置 pause 标记，`assistant/tests/parent-agent.test.mjs` 覆盖 step 收尾消费该标记并发出 `paused`。同步 `ARCHITECTURE.md`。验证：`node --test assistant/tests/task-store.test.js assistant/tests/parent-agent.test.mjs`。

- chore(frontend/assistant): 清理上次分类 pass 的残留风险。①`frontend/src/pages/WorldBuildPage.jsx` 与 `frontend/tests/pages/world-build-page.test.jsx` 物理删除（AppRoot 路由不含它，老 CHANGELOG-archive 也确认 `/build → /config` 已重定向覆盖，仅剩孤立测试在跑）。②`components/assistant/PlanDocViewer.jsx` 搬到 `assistant/client/PlanDocViewer.jsx`，由其唯一消费方 `assistant/client/MessageList.jsx` 改为同目录 `./PlanDocViewer.jsx` import，跨工程根的 `../../frontend/src/...` 相对路径消除；空目录 `frontend/src/components/assistant/` 一并退役。`CLAUDE.md` 与 `ARCHITECTURE.md §2` 同步删除 `components/assistant/` 行。验证：`npm run check` 全绿（前端 158 / 后端 478 / assistant 153 用例）。

- refactor(frontend): 组件分类清理 pass（不重做 shell，不改业务逻辑）。明确四层归属：`ui/` 真通用原子分子 / `edit/` 跨页面编辑流支架 / `<domain>/` 跨页面 domain / `pages/<Page>/components/` page-local。物理移动：①新建 `components/edit/`，把 `EditPageShell.jsx`、`AvatarUpload.jsx` 从 `components/ui/` 搬入（它们不是通用原子，是编辑流支架）；②`components/ui/InterruptedMark.jsx` → `components/chat/`（仅 chat / writing 域消息组件使用）；③`components/blocks/BackButton.jsx` → `components/ui/BackButton.jsx`，退役孤儿目录 `components/blocks/`；④page-local 下沉：`session/SessionListPanel.jsx` → `pages/ChatPage/components/`；`writing/{WritingSessionList,NearbyPanel,NearbyCharacterBlock,AddSavedNearbyModal,MakeCardModal}.jsx` → `pages/WritingSpacePage/components/`；`ui/SealStampAnimation.jsx` → `pages/CharacterEditPage/components/`；同步把这三个页面改造为 `pages/<Page>/index.jsx + components/` 多文件页面结构。删除：死代码 `components/ui/MarginaliaList.jsx`（零引用），空目录 `components/{characters,worlds,prompt,blocks}/`，stale snapshot `tests/components/blocks/__snapshots__/WorldTabNav.test.jsx.snap`（对应组件早已删除），以及 `tests/pages/world-edit-page.test.jsx` 中对 SealStampAnimation 的过期 mock（WorldEditPage 不再用）。barrel 重写：`components/index.js` 收紧到只导出 `ui/` 原子与分子（含搬过来的 `BackButton`），删除所有 domain（StatePanel、StatusSection、StatusTable、ChapterDivider、CharacterSeal、ActivatedEntriesRow、LongTermMemoryModal、AuxLlmBlock、AssistantModelBlock、PlanDocViewer）和 page-local（SessionListPanel/WritingSessionList/NearbyPanel/NearbyCharacterBlock/AddSavedNearbyModal/MakeCardModal/SealStampAnimation）以及死代码（MarginaliaList、InterruptedMark）的再导出，使 import path 反映真实归属。AppRoot 的 lazy import 形如 `import('../../pages/ChatPage')`，Vite 自动解析为 `ChatPage/index.jsx`，无需改路由。所有 page-local 组件的相对路径已同步加深一层（`../X` → `../../../components/X`、`../../X` → `../../../X`）。测试 mock 路径全部同步更新，`tests/components/blocks/` 迁到 `tests/components/ui/`。文档同步：`CLAUDE.md` 关键路径表 + 组件归属规则、`ARCHITECTURE.md §2` 目录树都改写为 ui/edit/domain/page-local 四层。验证：`npm run lint` 通过；`npm run test:frontend` 全绿（52 文件 159 用例）；`npm --prefix frontend run build` 通过。
  隐性坑点：（a）`PlanDocViewer` 虽在 `components/assistant/` 下，但 assistant 子应用通过相对路径 `assistant/client/MessageList.jsx` 直接 import 它，barrel 路径从未被使用——本次只去掉了死的 barrel 再导出，文件本身保留。（b）`pages/WorldBuildPage.jsx` 是 stale 页（不在 AppRoot 路由中，只剩孤立测试 `tests/pages/world-build-page.test.jsx`）；本次属于分类范畴外未动，未来若清理需同时删测试。

- refactor(frontend/shell): 抽出 `frontend/src/shells/classic-parchment/layout/pageLayoutRenderer.jsx`，把 `AppShell.jsx` 内联的 `renderPageLayout` 函数搬出来独立导出。`AppShell.jsx` 改为 import 它，行为不变；好处是测试可以直接 `import renderPageLayout` 并通过 `PageLayoutRendererProvider` 安装真实的 parchment shell 渲染契约（拿到真实的 `BookSpread + PageLeft + PageRight + MemoryRecallOverlay`），不再需要写假的 PageLayout mock 去复制 `recall.memoryWriting` 字段名。同步把 `frontend/tests/pages/chat-page.test.jsx` 与 `frontend/tests/pages/writing-space-page.test.jsx` 改为：移除自制的 `PageLayout` mock，新增 `renderChatPage()` / `renderWritingSpacePage()` 包一层 `<PageLayoutRendererProvider render={renderPageLayout}>`；记忆写入断言从合成的 `data-testid="left-page"`/`"left"` + `memory-writing/memory-idle` 文本，改为断言真实 overlay 的 `正在记录记忆…` 文案出现 / 消失，从而消除「字段名改动需同步改两处测试 mock」的残留风险。验证：`npm run test:frontend` 全绿（52 文件 159 用例）。

- fix(frontend/tests): 修复 `frontend/tests/pages/` 下 4 文件 18 用例失败。根因是 core/shell 重构后组件被搬迁，但页面测试的 `vi.mock` 路径仍指向旧 `components/book/...`，mock 静默失效导致真组件被加载（`SessionListPanel` 用到 `useNavigate`、`SectionTabs` 只渲染当前激活 tab，触发崩溃与断言失败）。逐文件修正：①`chat-page.test.jsx` 把 `components/book/SessionListPanel.jsx` → `components/session/SessionListPanel.jsx`、`components/book/StatePanel.jsx` → `components/state/StatePanel.jsx`；把 `book/BookSpread + PageLeft + PageRight` 整组 mock 替换为对 `core/layout/PageLayout.jsx` 的统一 mock（在 `recall.memoryWriting` 上渲染 `memory-writing/memory-idle` 文本与 `data-testid="left-page"`）。②`writing-space-page.test.jsx` 把 `components/book/NearbyPanel.jsx` → `components/writing/NearbyPanel.jsx`、`components/book/WritingSessionList.jsx` → `components/writing/WritingSessionList.jsx`、`components/book/WritingPageLeft.jsx` 替换为 `core/layout/PageLayout.jsx` 的统一 mock；并补齐 `react-router-dom` mock 中的 `useNavigate`。③`character-edit-page.test.jsx` / `world-edit-page.test.jsx` 把 `components/book/SectionTabs` 与 `components/book/SealStampAnimation` 修正到 `components/ui/SectionTabs.jsx` / `components/ui/SealStampAnimation.jsx`，恢复一次性渲染所有 tab content 的行为，让 `save-hp` 按钮与重复出现的「名称为必填项」断言可定位。验证：`npm run test:frontend` 全绿（52 文件 159 用例全部通过）。

- style(frontend): 优化 chat / writing 会话右栏视觉。①世界状态卡（`StatePanel.jsx` / `NearbyPanel.jsx` 的 `worldTab`）外包 `.we-world-frame` 卡片外框，与下方 `.we-cast-card` 共用同一套样式（`color-mix(--we-base-paper-100 35%)` 底色 + `--we-color-border-default 55%` 描边 + `--we-radius-md` 圆角 + 同 padding/margin），让上下两段保持视觉一致。②角色 / 玩家 / 附近 tab 区整体包入 `.we-cast-card` 浅色卡片（`color-mix(--we-base-paper-100 35%)` 底色 + `--we-color-border-default 55%` 描边），与上方世界框形成两段视觉分组。③所有动作按钮（重置 / 制卡 / 保存 / 移除 / 取消）追加 `.we-panel-card-action--chip` 修饰类，渲染为圆角细描边小 chip 并在文字前加 11px inline SVG icon（↻ / 笔记本 / 磁盘 / 垃圾桶 / × 圈），保持 `--we-color-accent` hover 色态、无新增 hex 与依赖。④`SectionTabs.jsx` 新增 `globalActions` prop，把 NearbyPanel 原本散落在每个角色 tab `actions` 里的「＋角色卡」全局化为 tab 名同一行的 `+` 图标 chip（仅图标），节省横向空间；per-tab actions 仅保留制卡 / 保存 / 移除 / 取消。`StatePanel` 不传 `globalActions`，行为保持。CSS 全部加在 `frontend/src/index.css`，未触主题层。验证：`npm run lint` 通过；`npm run test:frontend` 失败数与改动前一致（4 文件 18 用例失败，均为先前已存在的 react-router / ChatPage / WritingSpacePage 测试基础设施问题，非本次改动引入）；人工 `/chat?session=…` 与 `/writing?session=…` 右栏视觉与 after 截图一致，键盘 ←/→ 切换 tab、`+` 始终常驻并能打开 `AddSavedNearbyModal`、窄屏 chip 自动换行。

- refactor(backend): 抽出后端应用编排层，瘦身 `backend/routes/chat.js` 与 `backend/routes/writing.js`。新增 `backend/app/chat/`、`backend/app/writing/`、`backend/app/shared/`，把主流式生成、continue、regenerate/rollback、post-generation task builder 和 postgen/stream 骨架从 route 中迁出；route 现在主要保留参数校验、存在性检查、SSE/response 接线与轻控制器逻辑。共享层只收敛 stream lifecycle、收尾持久化、post-gen 调度与 rollback 骨架，chat/writing 语义差异（world/character vs writing nearby、chapter title、writing configScope 等）仍保留在各自 orchestrator。验证：`npm run lint --prefix backend`，`npm run test --prefix backend`。
# Changelog

> 每次任务完成后，在最上方追加一条记录。这是项目的"记忆"，给自己和 AI 看。  
> 新开对话时让 Claude Code 先读此文件，了解项目现状。

- fix(assistant): 恢复写卡助手输入框的高度上限，避免长文本把固定高度抽屉挤坏。`assistant/client/InputBox.jsx` 的自动增高重新改回 `Math.min(scrollHeight, 120)`，并恢复 `max-h-[120px] + overflow-y-auto`，让输入框在 120px 内自适应、超过后在内部滚动，不再把消息列表和发送/停止按钮挤出视口。验证：在写卡助手里粘贴多段长文本，输入框增长到约 120px 后停止继续扩张，消息列表仍保持可见，发送/停止按钮不被顶出面板。
- style(assistant): 写卡助手两处微调。① 任务计划条目（`.we-asst-entry--plan`）和工具调用条目（`.we-asst-entry--tool` / `--tool-running`）去掉左侧朱砂/灰色竖线锚点（`::before` 改为 `display:none`），与图卡视觉对齐避免重复强调；② 输入框 textarea 改为完全自适应高度，移除 `max-h-[120px]` 上限与 `we-assistant-scroll` 滚动条样式，`overflow-hidden` 防止过渡帧出现滚动条，`useEffect` 中 `style.height = scrollHeight + 'px'` 不再 clamp。验证：在 `/characters/:id/chat` 打开写卡助手，多次 Shift+Enter 换行时输入框应同步加高、不出现滚动条；任务计划卡片左侧无朱砂细线。

- style(assistant): 写卡助手输入框 textarea 的滚动条复用 `.we-assistant-scroll` 羊皮纸样式（4px 宽、`--we-color-border-default` 拇指、透明轨道），与上方消息列表保持一致。原先 macOS 系统默认深色竖条不再出现。`assistant/client/InputBox.jsx` 给 textarea 加上该 class，其余样式不动。验证：在 `/characters/:id/chat` 打开写卡助手，向输入框粘贴多行文本至超过 max-h(120px) 时，右侧滚动条应为细窄陶土色而非系统深色。

- chore(assistant): 简化 `MessageList.jsx` 残余分支：`STATUS_TEXT` 删掉空串的 `done` 键（查表本就有 `?? ''` 兜底）；原 `StatusDot({status})` 在最近一次改动后仅剩 error 一条分支且仅 `ErrorEntry` 一处调用，重命名为参数无关的 `ErrorDot` 并就地替换。

- chore(frontend): 前端 shell 重构 final closure pass。删除迁移期残留 `frontend/src/components/settings/FieldLabel.jsx`（纯再导出，零调用方）。`frontend/src/components/index.js` 抹掉 "自 components/book 拆分迁出，保留 barrel 兼容" 注释与已不存在的 `WritingPageLeft` 引用，UI 原子合并为单一区段，顶部直接说明该 barrel 不导出 shell 内部 chrome。`frontend/src/shells/README.md` 从 chrome 列表移除已不存在的 `WritingPageLeft`。`frontend/src/core/layout/PageLayout.jsx` 注释改写：明确这是 shell-structured 页面的 preferred composition path（今 ChatPage / WritingSpacePage），删去 "opt out / 迁移用" 措辞但不虚假宣称全量强制；默认 renderer 文案改为中性 fallback 说明。`ARCHITECTURE.md` 修正 stale 路径：组件目录树移除 `book/`、补齐 `session/ assistant/`；状态系统章节 `frontend/src/components/book/StatusTable.jsx` 改为 `frontend/src/components/state/StatusTable.jsx`。此前保留的旧主题兼容别名在后续主题收口中已彻底移除。验证：`grep -rn "components/book\|components/settings/FieldLabel" frontend/src/` 零命中；`npm --prefix frontend run build` 通过；`npm run lint` 全量通过。

- refactor(frontend): 完成 `components/book/*` 解耦迁移，页面层零 shell-chrome import。新增 `frontend/src/shells/classic-parchment/layout/`（BookSpread、PageLeft、PageRight、WritingPageLeft、Bookmark、ParchmentTexture、PageFooter、FleuronLine — 都是 shell 结构 chrome）；新增 `frontend/src/shells/classic-parchment/components/MemoryRecallOverlay.jsx` 承接原 PageLeft/WritingPageLeft 中的记忆检索指示器。AppShell 通过 `PageLayoutRendererProvider` 暴露 slot 渲染器 `(left/main/right/inspector/overlay/recall/leftVariant)` → BookSpread + (PageLeft|WritingPageLeft) + PageRight 的两页拼合。`PageLeft` / `WritingPageLeft` 重构为纯 `{children, recall, className}` 视觉外壳，session list 内容由页面通过 `left` 槽位注入。内容组件按领域归位：`components/state/`（StatePanel、StatusSection、StatusTable）、`components/session/`（SessionListPanel）、`components/writing/`（WritingSessionList、NearbyPanel、NearbyCharacterBlock、AddSavedNearbyModal、MakeCardModal）、`components/ui/`（SectionTabs、PanelCard、SealStampAnimation、MarginaliaList）、`components/chat/`（CharacterSeal、ChapterDivider）。`components/book/` 目录已物理删除，`components/index.js` barrel 改为指向新路径；删除死代码 `components/chat/Sidebar.jsx`（自 SessionListPanel 引入后已无引用）。`App.jsx`、`frontend/src/core/`、`frontend/src/pages/` 全部零 `components/book` import；ChatPage / WritingSpacePage 改用 `PageLayout` 槽位；CharacterEditPage / WorldEditPage 切到 `components/ui/SectionTabs` 与 `components/ui/SealStampAnimation`。WritingSpacePage 新增 `useNavigate` 以承接原 WritingPageLeft 内部的 `onBack` 跳转。`frontend/src/shells/README.md` 同步更新 classic-parchment 描述，`CLAUDE.md` 关键路径删除 `components/book/` 行并补充 `components/session/` `components/writing/`。验证：`grep -rn "components/book" frontend/src/App.jsx frontend/src/core/ frontend/src/pages/` 零命中；`npm --prefix frontend run build` 通过；`npm run lint` 全量通过；人工检查 `/characters/:id/chat`、`/worlds/:id/writing`、`/characters/:id/edit`、`/worlds/:id/edit` 视觉与交互应与重构前一致。

- refactor(frontend): 拆分前端 core / shell / theme 三层。新增 `frontend/src/core/app/AppRoot.jsx`（路由 + 全局副作用，原 `App.jsx` 中的 useEffect、`<Routes>`、抽屉路由、`<AssistantPanel>` 全部迁入）和 `frontend/src/core/app/selectShell.js`（壳注册表，默认 `classic-parchment`）；新增 `frontend/src/core/layout/`（`PageLayout` + `HeaderSlot/MainContentSlot/LeftSidebarSlot/RightSidebarSlot/InspectorSlot/OverlayLayer/TransitionContainer` 中性槽位契约，`layoutSlots.js` 拆分常量以满足 react-refresh boundary）。新增 `frontend/src/shells/`：`README.md` 描述壳/主题边界与依赖方向；`template/` 提供新壳脚手架；`classic-parchment/AppShell.jsx` 拥有 TopBar + GlobalToast + PageTransition 组合，`classic-parchment/components/TopBar.jsx` 与 `classic-parchment/transitions/PageTransition.jsx` 是原 `components/book/TopBar.jsx`、`components/book/PageTransition.jsx` 的物理迁移目标，旧路径仅保留兼容再导出。`App.jsx` 收缩为 `selectShell()` + `<AppShell><AppRoot/></AppShell>`，不再直接 import 任何 book 路径。pages 内的 `components/book/*` 调用保持不变（标注为 shell-owned 实现细节，待后续按 slot 契约迁移）。`CLAUDE.md` 关键路径补 `core/app` `core/layout` `shells/` 三个新位置。验证：`npm --prefix frontend run build` 通过；`npm run lint` 全量通过；访问 `/`、`/worlds/:id`、`/characters/:id/chat`、`/worlds/:id/writing`、`/settings` 视觉与行为应与重构前一致。

- docs(theme): 更新主题文件夹文档与模板。`themes/README.md` 补齐快速开始、推荐覆盖 token、卡片/面板皮肤 token、全局质感 token、分层边界与“不建议做的事”，明确主题只覆盖视觉取值，不复制组件选择器、不控制 icon/双页布局等 React 结构。`themes/_template/theme.css` 扩展为更完整的中性 token 模板，覆盖基础色、透明叠加、卡片/面板皮肤、壳层质感与动效节奏；`theme.json` 预览色与描述改为中性模板。

- refactor(theme): 执行主题内核分离一阶段。`frontend/src/styles/tokens.css` 的默认取值改为中性核心 token，原羊皮纸色板、透明叠加、顶栏深色层、书脊阴影、纸张/印章阴影、卡片/面板皮肤迁入 `themes/classic-parchment/theme.css`；旧变量名（如 `--we-color-bg-canvas` / `--we-color-accent`）保留为兼容别名，避免一次性改动组件结构。新增 `--we-card-*` / `--we-panel-card-*` 组件皮肤 token，并让世界卡、角色卡、玩家卡、通用 Card、PanelCard 使用这些 token，以便主题控制卡片边框/阴影/圆角。`themes/_template/theme.css` 与 `themes/README.md` 改为中性主题模板和分层说明；`DESIGN.md` / `CLAUDE.md` 明确羊皮纸是默认主题而非核心视觉内核。

- fix(characters): 角色卡拖动换位时被换位的卡片仍会闪一下。`.we-character-card` 的入场动画 `animation: weInkRise ... both` 配合 `:nth-child(N)` 的 `animation-delay` 阶梯，意味着两张卡片换位后会匹配到不同的 nth-child 选择器、得到不同的 `animation-delay`，Chrome 会就此重新评估动画并触发短暂闪烁。玩家卡没有这个入场动画因此一直顺滑。直接移除角色卡的入场动画与 nth-child 延时分组，保留拖拽过渡由 framer-motion 独占驱动。`frontend/src/styles/pages.css`。

- fix(characters): 角色卡拖动重排途中不丝滑。`.we-character-card` 的 `transition` 同时声明了 `transform` 与 `box-shadow`，而 framer-motion 的 `Reorder.Item` 在拖拽过程中直接以 `transform` 驱动布局位移；CSS 过渡会试图在每一帧再插值一次 transform，与 framer-motion 自身的动画双重叠加，导致中段出现停顿。hover 态实际只改 `box-shadow`，因此从 transition 列表里去掉 `transform` 即可，玩家卡此前 hover 未触发 transform 变化所以无感。`frontend/src/styles/pages.css`。

- style(characters): 移除激活玩家卡的 `personaActivate` 缩放动效。该动画绑定在 `.we-persona-card--active` 上，每次进入角色选择页（组件挂载）都会触发"跳一下"，干扰阅读。删除 `animation` 声明与 `@keyframes personaActivate`，激活态仅保留陶土色左边框与背景填充作为视觉标识。`frontend/src/styles/pages.css`。

- fix(theme): 主题 CSS 加载失败不再被用户切换流程静默吞掉。`refreshThemeCss(id)` 默认会抛出 `/api/themes/:id/css` 的加载错误，仅应用启动路径显式传 `{ silent: true }` 保持核心样式兜底；设置页手动切换主题时先保存后加载 CSS，只有 CSS 注入和自定义 CSS 刷新成功后才更新本地 active 状态。若保存 active theme 后 CSS 加载失败，会尝试把后端 active theme 回滚到原主题并提示“切换失败”，避免设置页显示新主题、实际页面仍套旧 `<style id="we-theme-css">` 的不一致状态。验证：`npm --prefix frontend test -- --run src/api/__tests__/themes.test.js src/components/settings/__tests__/ThemeManager.test.jsx`。

- docs(theme): 补齐 `themes/README.md` 与 `themes/_template/`，明确主题开发契约：主题只覆盖 `--we-*` token，不复制组件结构 CSS；未来修改前端组件时，新增视觉语义应先落在核心样式 / `tokens.css` 默认 token 层，主题会自动继承新界面，只有主题主动想改新 token 取值时才需要更新。默认羊皮纸内置主题目录/id 从 `parchment` 改为更明确的 `classic-parchment`，并在配置迁移中兼容旧 `dark` / `parchment` 值自动回落到新默认 id；主题扫描忽略 `_` 开头模板目录。

- feat(theme): 引入前端主题包架构。新增根目录 `themes/classic-parchment/` 作为默认内置羊皮纸主题，用户导入主题落到 `data/themes/{id}/theme.json + theme.css`；`config.ui.theme` 默认值从旧 `dark` 迁移为 `classic-parchment`。后端新增 `/api/themes` 系列接口：列表、CSS、切换 active、JSON 主题包导入/导出、删除用户主题（内置主题拒绝删除）。前端新增 `api/themes.js` 与设置页「主题」入口，启动加载顺序固定为核心 CSS → 当前主题 `<style id="we-theme-css">` → 自定义 CSS `<style id="we-custom-css">`，切换主题后派发 `we:theme-updated` 并重新刷新自定义 CSS 以保持用户覆盖层最高优先级。同步更新 `SCHEMA.md` / `ARCHITECTURE.md` / `DESIGN.md` / `CLAUDE.md`。

- fix(chat,writing): `parseNextPromptStream` 取 think 之外的**最后一个** `<next_prompt>` 作为切点，避免模型在正文中段先吐一次草稿就把后续正文一刀切掉。`frontend/src/utils/next-prompt.js`：`indexOf` → `lastIndexOf`；`findRawAnchor` 改为从原文末尾向前扫描，匹配 `stripThinkBlocks(prefix).length === idxInCleaned` 的位置。think 块内的 `<next_prompt>` 仍由 `stripThinkBlocks` 提前剥除，不参与匹配。验证：聊天/写作页生成消息，若模型 thinking 中草拟过 `<next_prompt>`、随后正文又输出真正的 `<next_prompt>`，正文显示完整无中段截断，选项按钮使用正文末尾那组。

- refactor(book): 彻底移除 `StatusSection` 的 `pinnedName` 死代码。删除 props 解构项、`hasName` 派生与"姓名 | XXX"合成行；动画延时回归 `i * 45ms`。`pinnedName` 已无任何调用方，保留只会污染 API；如未来需要顶置展示名字，可在调用方自己组装字段行。

- style(chat): 移除聊天页玩家 tab 顶部冗余的"姓名"合成行。`StatePanel.jsx` 的 playerTab 不再向 `StatusSection` 传 `pinnedName={persona?.name}`，与 NearbyPanel(写作页) 对齐——tab 标签本身已显示 persona 名字，不必在字段表里再钉一行。验证：访问 `/chat`，玩家 tab 不再出现"姓名 | XXX"行，下面直接是真实状态字段。

- style(chat,writing): 去掉 tab 行 actions 下的章节细线与多余空白。`.we-state-panel/.we-cast-panel .we-section-tabs-bar` 移除 `border-bottom`；`.we-section-tabs-actions` 上下内边距由 `6px/6px` 收到 `4px/0`；`.we-state-panel/.we-cast-panel .we-panel-tab-body` 顶部 `padding` 由 `4px` 改为 `0`，让 tab 内容紧贴 actions 行。验证：访问 `/writing`/`/chat`，切到附近角色 tab，"+角色卡 制卡 取消"下方不再出现横线和大段留白。

- style(chat,writing): 修复附近角色 tab 名字被挤成两行（如"王守寂"显示成"王守/寂"）的问题。`.we-section-tab` 补 `white-space: nowrap` + `flex-shrink: 0`，让 tab 保持完整单行宽度；溢出时由 `.we-section-tabs-list` 的 `overflow-x: auto` 接管出现横向拖动条；点击右侧 off-screen tab 时已有的 `scrollIntoView({inline:'nearest'})` 自然让拖动条向右跟移，反之亦然。验证：访问 `/writing`，附近角色超过 5–6 个时 tab 行出现横向滚动条，每个名字单行显示。

- style(chat,writing): 右栏世界状态块与下方 tab 区改用 fleuron 章节分隔（线—❦—线），并移除原 `:first-child` 的 padding/margin/border-bottom 多余收尾（避免出现一条细线后再大段留白）。`StatePanel.jsx`（ChatPage 使用）与 `NearbyPanel.jsx`（WritingSpacePage 使用）在 `worldTab` 和 `SectionTabs` 之间直接内联静态 `we-chapter-divider.we-fleuron--visible` 节点（不走 IntersectionObserver，避免出现 opacity:0 不显示的情况）；`index.css` 新增 `.we-state-panel .we-state-scroll > .we-cast-fleuron, .we-cast-panel .we-cast-scroll > .we-cast-fleuron { margin: 6px 12px 8px; opacity: 1; clip-path: none; animation: none; }`，强制可见并收紧上下间距。验证：访问 `/chat`、`/writing`，确认右侧"世界状态"卡片正下方紧接一条带 ❦ 的分隔线，下方紧接 tab 行，无大段空白。

- style(frontend): 所有会话页面的新建会话 / 新对话按钮改为方角。旧聊天侧栏 `.we-chat-new-btn` 与书卷会话列表 `.we-session-list-create` 的 `border-radius` 从 `--we-radius-md` 改为 `--we-radius-none`，保留原边框、颜色与 hover 行为。
- style(frontend): 世界卡片 / 角色卡片 / 玩家卡片移除右下角纸片堆叠。`frontend/src/styles/pages.css` 中 `.we-world-card`、`.we-character-card`、`.we-persona-card` 及对应 hover/dragging 态的阴影从 `--we-shadow-paper-stack(-hover)` 改为 `--we-shadow-paper-lift`，保留纸面轻微抬升但不再出现右下角双层纸边。
- style(chat,writing): 右栏世界状态块与下方 tab 区之间补一条章节分隔线。`.we-state-panel / .we-cast-panel` 的 `.we-cast-scroll > .we-panel-tab-body:first-child` 加 `padding-bottom: 14px; margin-bottom: 12px; border-bottom: 1px solid var(--we-color-border-default)`,与 flush header 那条更淡的线形成"双线收尾"的章节边界,避免世界字段直接顶到 tab 行。
- style(chat,writing): 右栏顶部世界卡降级为 flush 章节式。`StatePanel.jsx` / `NearbyPanel.jsx` 的 `worldTab` PanelCard 加 `variant="flush"`(透明背景 + 仅底部细划线),消除"独立矩形卡 + tab 块 + actions 行"三段割裂感;StatePanel 标题也跟进改为 `worldName || '世界状态'`,与 NearbyPanel 对齐;`.we-panel-card--flush > header` / `> body` 左右内边距由 4px 调到 12px,与 `.we-section-tabs-bar` 的 `padding-left: 12px` 视觉对齐。验证:`npx eslint` 改动文件全绿。
- style(writing): 附近角色字段两列展示。`NearbyCharacterBlock.jsx` 内 `StatusSection` 补 `headerless` + `gridLayout`,与世界/玩家面板对齐(短值进 2 列 `.we-fields-list--grid`,长值跨行)。
- style(chat,writing): 已保存的附近角色 tab 标签朱砂加粗。`NearbyPanel.jsx` 的 `perCharSections` 在 `is_saved===1` 时把 label 包成 `<span class="we-section-tab-label--saved">`,pages.css 新增 `.we-section-tab-label--saved { color: var(--we-color-accent); font-weight: 600; }`(active 状态保持朱砂)。
- style(chat,writing): 重置 / 工具栏按钮在 actions 行内统一靠右(`.we-section-tabs-actions { justify-content: flex-end }`)。
- style(chat,writing): SectionTabs 横向滚动 + 键盘切换 + actions 下移。`.we-section-tabs-bar` 改为 `flex-direction: column`,actions 槽从 tab 行右侧迁到 tab 行下方独立子行;`.we-section-tabs-list` 还原可见细滚动条(`scrollbar-width: thin` + WebKit 6px),tab 数超出宽度时出现拖动条。`SectionTabs.jsx` 用 `tabRefs` + `useEffect` 在 active 变化时把当前 tab `scrollIntoView({block:'nearest', inline:'nearest', behavior:'smooth'})`,实现"切右侧 tab 滚动条同步右移"的反向同步;tab 列表加 `role="tablist"`,按钮加 `role="tab"` / `aria-selected` / roving tabIndex,键盘 ←/→ 切换相邻 tab,Home/End 跳到首尾,切换后用 `requestAnimationFrame` 把焦点搬到新 tab 以支持连按。`.we-section-tabs-actions` 加 `justify-content: flex-end`,让"重置 / +角色卡 / 制卡 / 保存(或取消)/ 移除"等操作按钮统一靠右对齐。验证:`npx eslint` 改动文件全绿。
- style(chat,writing): 附近角色 tab 行布局收敛与去重。`SectionTabs` tab 栏改为强制单行：`.we-section-tabs-bar` 加 `flex-wrap: nowrap`、`.we-section-tabs-list` 改 `flex-wrap: nowrap; overflow-x: auto`（隐藏滚动条），避免「+角色卡 / 制卡」把 tab 名挤到第二行。每个 nearby tab 的 actions 槽现在包含「+角色卡 / 制卡 / 保存(或取消) / 移除」四枚按钮，按 `nearby.is_saved` 切态；对应地 `NearbyCharacterBlock.jsx` 删除原本顶部的"角色名 + 取消/保存/移除"标题行（与 tab 标签重复），只保留"人设"段与状态字段。`NearbyPanel.jsx` 新增 `nearbyToolbarBase` 与 `nearbyToolbarFor(n)`，把 `setNearbySaved` / `removeNearby` 调用从子组件上移到面板，统一走 `reloadNearby`。同时把"世界状态"PanelCard 的固定标题改为运行中世界名（`worldName || '世界状态'` 兜底）。验证：`npm run lint` 待跑。
- style(chat,writing): 右侧世界状态保留卡片样式、去图标、标题字体优化。`StatePanel.jsx` / `NearbyPanel.jsx` 世界状态 PanelCard 去掉 `variant="flush"`(回到 boxed 默认)与 `icon={GlobeIcon}`,GlobeIcon 常量及未再用的 `Icon` import 全部删除。`frontend/src/index.css` 的 `.we-panel-card-title` 优化:`font-size 13 → 15px`、`font-weight 600 → 500`、`letter-spacing 0.04em → 0.12em`,英文场景通过 `:lang(en)` 回落到 0.06em 避免拉太开;视觉上中文标题更书卷化、更有呼吸感。tab 内 headerless 卡 + tab 行 actions 槽方案保持不变。验证:`npx vite build` 通过。
- style(chat,writing): 右侧面板视觉重设计——「无卡片融合式」。`PanelCard.jsx` 新增 `variant` prop(`boxed` 默认 / `flush` 融入纸面章节式 header / `headerless` 不渲染头部),`headerless` 时忽略 icon/title/actions 由父级承接。`SectionTabs.jsx` 在 sections 数组里新增可选 `actions` 字段,激活 tab 时渲染在 tab bar 右侧;tab bar 改为 `flex justify-between`,新增 `.we-section-tabs-list` / `.we-section-tabs-actions` 容器,在 `.we-state-panel` / `.we-cast-panel` 作用域内附加底部 1px 细划线作为章节边界。`StatePanel.jsx`:世界状态切到 `variant="flush"`(保留章节式标题 + 重置);玩家/角色/日记 tab 卡全部 `variant="headerless"`,玩家/角色对应「重置」按钮通过 sections.actions 渲染在 tab 行右侧——彻底解决 tab 已显示「陆景言」卡片内又出现「玩家·陆景言」的标题重复占位;UserIcon / UsersIcon / BookIcon 常量已删。`NearbyPanel.jsx` 同步切到 flush/headerless,玩家 tab 重置按钮、每个 nearby 角色 tab 的「+角色卡 / 制卡」工具栏、空 nearby 占位 tab 的工具栏全部迁到 SectionTabs actions 槽;UserIcon / UsersIcon / BookIcon 删除。`frontend/src/index.css` 收敛旧 `.we-panel-card` 边框/阴影/圆角到 boxed 默认,新增 `.we-panel-card--flush`(透明背景 + header `padding 2px 4px 6px` + 章节式 `border-bottom`)与 `.we-panel-card--headerless`(透明 + body `padding 4px`),`.we-panel-tab-body` padding `8 12 16` → `4 12 12`、gap `12` → `8`。`frontend/src/styles/pages.css` 改造 `.we-section-tabs-bar`:`justify-content: space-between` + `align-items: flex-end` + `gap: 8px`,引入 `.we-section-tabs-list`(承载 tab 按钮)与 `.we-section-tabs-actions`(承载 tab 级操作)。验证:`npx eslint` 改动 4 个文件全绿;人工核对聊天页右栏:无矩形卡片描边/阴影/圆角,世界状态与 tab 区以章节标题 + 全宽细划线分隔,切换玩家/角色/日记 tab 时卡片内不再出现「玩家·X」「角色·X」「日记」标题行,「重置」按钮跟随激活 tab 在 tab 行右侧。
- style(chat,writing): 统一字段行间距机制，消除"gap + margin-bottom 双轨"。`.we-fields-list` 改为 `display: flex; flex-direction: column; gap: 10px`，让容器接管行距；`.we-status-field` 删除 `margin-bottom: 10px`，删除 `.we-fields-list--grid .we-status-field { margin-bottom: 0 }` 兜底规则。grid 场景下 `.we-fields-list--grid` 的 `display: grid` 自然覆盖 flex 布局，行距由 `row-gap: 12px` 控制；非 grid 场景（仅 `NearbyCharacterBlock` 一处）行距由父级 flex `gap` 控制，子项无外边距，视觉效果与改动前一致。验证：`npm run lint` 全绿。
- style(chat,writing): 右侧状态/角色面板 CSS 节奏微调（基于截图复盘）。①`.we-status-key`：去掉 `text-transform:uppercase`（对中文无效）和 `opacity:0.75`（与 `--we-color-text-tertiary` 双重淡化），字距从 0.18em 收到 0.06em，字号 11→11.5px；保留 `:lang(en)` 分支让英文场景沿用原大写 + 宽字距。②`.we-fields-list--grid` 改用 `repeat(2, minmax(0, 1fr))` 并给 `.we-status-field` 加 `min-width: 0`，避免子项撑爆网格；`.we-status-value` 的 `word-break: break-word` → `keep-all`（中文长串不再单字断行），grid 内统一 `margin-bottom: 0`（与外部 `row-gap` 二选一）；`StatusSection.jsx` 的 `isShortField` 把 `datetime` 也归为非短字段（跨整行渲染），解决"2025年9月10日13时45分"在 2 列窄宽下折行问题。③`pages.css` 的 `.we-section-tabs-bar` 加 `padding-left: 12px` 与卡片内容左缘对齐，`.we-section-tab` padding 由 `10px 16px` 收到 `8px 14px`，`.we-section-tab-indicator` 由 `left:0 right:0` 改 `left:14px right:14px`（指示线与文字而非 padding box 对齐）。④`.we-panel-card-action`（即"重置 / ＋角色卡 / 制卡"等）加 `padding:2px 8px` + `border-radius:4px` + `border:1px solid transparent`，hover 显示朱砂 35% 边框 + 6% 朱砂底，给操作按钮真正的 affordance；新增 `:disabled { opacity:0.4 }` 与 NearbyCharacterBlock 的 busy 态对齐。所有色值经 `color-mix(in srgb, var(--we-color-accent) ...)` 走 token，无裸 hex/rgba。验证：`npm run lint` 全绿。
- chore(frontend): 彻底删除已废弃的 `PanelHero` 组件 —— 删除 `frontend/src/components/book/PanelHero.jsx` 文件，移除 `frontend/src/components/index.js` 中的 export 注册，移除 `frontend/src/index.css` 中 `.we-panel-hero/.we-panel-hero-avatar/.we-panel-hero-meta/.we-panel-hero-title/.we-panel-hero-subtitle/.we-panel-hero-chips/.we-panel-hero-chip/.we-panel-hero-badge` 全部相关样式与上方区段注释。验证：`npm run lint` 全绿、前端 vitest 153 测全绿。
- style(chat,writing): 右侧面板顶部不再保留 `PanelHero` 身份卡，也不再保留"世界" tab；改为把世界状态 PanelCard 常驻渲染在 tab 栏之上（写作页 = `worldTab`，聊天页同），切 tab 不影响世界卡显示。`StatePanel.jsx` / `NearbyPanel.jsx` 删除 `PanelHero` 引入与 hero 渲染，tabs 默认 key 改为 `'player'`。验证：`npm run lint` 全绿。
- style(chat,writing): 右侧面板 tab 形态收敛。写作页 `NearbyPanel.jsx` 把"附近"单一 tab 拆为每个 nearby 角色一个顶级 tab（按 `nearby[i].id` 作 key，列表变化时热更新，活跃 tab 失效自动回落到第一个），`+角色卡` / `制卡` 操作迁到每个角色 tab 的 PanelCard actions 槽；空 nearby 时仍渲染单个"附近"占位 tab 承载工具栏。聊天页 `StatePanel.jsx` 把"玩家" / "角色"两个 tab 的标签改为运行中的 `persona.name || '玩家'` / `character?.name || '角色'`，写作页"玩家" tab 同样改为 persona 名。`SectionTabs.jsx` 删除 `❦` fleuron 分隔条（连同上下细横线），并新增"active 不在 sections 中时渲染期回退到第一个"逻辑（不写状态、不触发 effect 反馈循环）。`PanelCard.jsx` 砍掉折叠 chevron 与 `defaultOpen/collapsible` 形参，header 不再可点击，永远展开（卡内永远显示 body）。`NearbyCharacterBlock.jsx` 同步移除 chevron + `expanded/onToggle` props + grid-row 动画包裹，常驻展开；旧 `Icon` import 一并清掉。验证：`npm run lint` + 前端 vitest 153 测全绿；人工核对 chat / write 两页右栏 tab、卡片不再有 ▼ 折叠按钮、tab 之间无 ❦ 装饰。
- style(chat,writing): 右侧状态栏 tab 内容卡片化 + 顶部固定 Hero 卡（参考 Image #3 节奏）。新增两个 book 组件：`frontend/src/components/book/PanelHero.jsx`（avatar/seal + 主名 + 副信息 + chips slot，固定在 `SectionTabs` 之上，跨 tab 不切换；chat 模式 hero 主体 = 当前 character，writing 模式 = 当前 world）；`frontend/src/components/book/PanelCard.jsx`（icon + 标题 + chevron + 折叠 body，统一各 tab 的分组样式）。每个 tab 内的 StatusSection / 日记 / 附近角色都包到 PanelCard 内：tab 头部不再有底色横线，改为「圆角米色卡片 + 左 icon + 标题 + 右 chevron + 操作按钮 actions slot」。`StatusSection.jsx` 新增 `headerless` 与 `gridLayout` 两个 prop：`headerless` 让外层 PanelCard 接管标题与折叠交互；`gridLayout` 渲染时把短值字段（boolean/number/enum/datetime/单行 text）放进 2 列网格 `.we-fields-list--grid`，长值（list/table）通过 `.we-status-field--long` 跨满整行。`StatePanel` / `NearbyPanel` 重排 tab 内容：每 tab 一张或多张 PanelCard，重置按钮挪到 PanelCard 右上 actions 槽。`frontend/src/index.css` 追加 `.we-panel-hero/.we-panel-card/.we-fields-list--grid/.we-timeline--in-card` 系列样式（全部走 `--we-*` token）。`components/index.js` 注册 PanelCard / PanelHero。验证：`npm run lint` + `npm run test:frontend`（153 测）全绿；人工跑 chat / writing 两页右栏验证 hero 固定、tab 切换不动、卡片折叠、短值 2 列网格。
- style(chat,writing): 会话页右侧面板（chat=`StatePanel` / writing=`NearbyPanel`）从"全部纵向堆叠 + 区块折叠 chevron"重构为横向 Tab 切换形态。chat 模式 4 tab：世界 / 玩家 / 角色 / 日记（chat 模式头部印章 + 角色名移入"角色"tab 顶部）；writing 模式 4 tab：世界 / 玩家 / 附近 / 日记（"附近"tab 内当 ≥2 个 nearby 角色时再嵌一层子 tab，按 `nearby[i].name` 切换；单角色时不显示子 tab 直接渲染卡片；`NearbyCharacterBlock` 始终 `expanded=true`，原 `nearbySectionOpen` / `expandedIds` 状态删除）。复用 `SectionTabs`（`components/book/SectionTabs.jsx`），新增 `variant="sub"` 用于嵌套实例 + `useId()` 生成唯一 `layoutId` 防止父子 tab 指示线串扰。`.we-state-panel` / `.we-cast-panel` 宽度 `22%/300/420 → 28%/360/520`。"日记"tab 受 `config.diary.{chat,writing}.enabled` 控制：关闭时该 tab 完全不渲染（不仅是隐藏内容）。组件挂载时 `getConfig()` 拉取，并监听 `we:global-config-updated` 窗口事件做热更新；`frontend/src/api/config.js` 的 `updateConfig()` 在 PUT 成功后会派发该事件（携带最新 config 作为 `event.detail`），与原有 `useSettingsConfig` 的监听对齐，避免新增第二套事件名。`useSettingsConfig` 自己的 `patchConfig()` 也会触发同一事件，为避免设置页就地多一次冗余 refetch，新增 `suppressNextReloadRef` 在自身派发前置位，监听器命中后清零跳过一次 reloadKey 自增；外部来源派发依然正常触发刷新。`frontend/src/styles/pages.css` 追加 `.we-section-tabs--sub` 子变体（紧凑字号、隐藏 fleuron 分隔）、`.we-panel-tab-body` / `.we-panel-tab-header` / `.we-panel-tab-caption` / `.we-nearby-tab-actions` 等 tab 内排版类。验证：`npm run lint` 全绿；前端启动后人工验证 chat 与 writing 模式两个面板的 tab 切换、字段读写、+角色卡 / 制卡弹窗、日记开关影响 tab 显隐。
- fix(assistant): 服务端持久化工具调用时同步前端重试合并语义。`task-store.emit(tool_call_started)` 在追加新 `tool_call` UI 记录前，会先复用同一 task 内最近的同名失败工具行并替换为新 `callId` 的 running 行，避免刷新或 `messages_changed` 从 `assistant_tasks.messages_json` 恢复出旧红色失败标记。补 `assistant/tests/task-store.test.js` 回归覆盖失败后同工具重试成功只保留一条记录。验证：`node --test assistant/tests/task-store.test.js` 通过。
- fix(assistant): 持久化写卡助手工具调用 / step / plan doc UI 记录，刷新后不再丢失。`assistant/server/task-store.js` 在 `emit()` 中集中处理 `tool_call_started/completed`、`step_started/completed/failed`、`plan_doc_updated`，同步 upsert 到 `assistant_tasks.messages_json` 后再广播 SSE；hydrate 时把残留 `running` UI 行标成 `error(interrupted by restart)`，避免重启后假运行。`parent-agent.js` 新增模型历史过滤，只有 `user/assistant` 文本进入上下文摘要和 LLM 输入，`tool_call/step/plan_doc` 只用于 UI 回放。`assistant/client/useAssistantStore.js` 的持久化清洗改为保留 `tool_call/step/plan_doc`，并修复 `clearStreamingFlag` 只看最后一条消息导致 assistant 后插入工具行时 think block/操作栏状态不收尾的问题。父代理 prompt 与 CONTRACT 收紧：plan mode 必须调 `write_plan_doc` 触发 `awaiting_approval`，禁止输出普通 Markdown 计划让用户聊天确认。同步 `SCHEMA.md` / `ARCHITECTURE.md`；验证：`npm run test --prefix assistant` 通过。
- style(assistant): 写卡助手抽屉重设计 — **混合节奏**：user / assistant 文本对话保留传统左右气泡（朱砂气泡右贴 / 羊皮纸气泡左贴），工具步骤 / 计划 / 错误 / 流式占位收敛为同一卡片原子 `.we-asst-entry`（左侧细竖线区分：朱砂=工具运行/完成、深红=错误、褪色墨=普通；右侧 6px 苔藓绿/朱砂状态点替代旧勾形 SVG）。原横条 spinner（VerboseMessage）下线；运行中工具条左竖线走 `we-stream-pulse` 脉冲。`<think>` 块由可折叠卡片改为助手气泡内的衬线斜体「思考」单行，点击展开完整 markdown。`assistant/client/MessageList.jsx` 重写消息渲染：新增 `UserEntry / AssistantEntry / ToolEntry / PlanEntry / ErrorEntry / PendingEntry / ThinkLine`，user/assistant 用 `.we-asst-row + .we-asst-bubble` 类，工具/计划/错误用 `.we-asst-entry` 类。`frontend/src/styles/chat.css` 末尾追加两套类（卡片原子 + 气泡变体），仅用 `--we-*` token，错误背景与用户气泡内代码块底色用 `color-mix` 不用 rgba。`PlanDocViewer` 新增 `variant="plain"` prop，外层卡片由 `PlanEntry` 提供避免双层包裹。`InputBox.jsx` 圆角与按钮背景改走 token。验证：`npm run lint` / `npm run test:frontend` 全绿。
- style(chat,writing): 美化流式中断标记。新增 `frontend/src/components/ui/InterruptedMark.jsx`（书签风：左右细笔触 + 衬线斜体「已中断」，配色用 `--we-color-status-warning`，去掉旧 `.we-message-interrupted` 硬边 ring 徽章），在 `components/index.js` 注册。`MessageItem.jsx` / `WritingMessageItem.jsx` 改为先 strip 末尾 `[已中断]` 标记、再交给 `parseStreamingBlocks`，把中断标志挂到最后一个 block（think 或正文），在该 block 末尾内联渲染 `<InterruptedMark>`；移除原先挂在角色名旁的 `.we-message-interrupted` badge。`WritingMessageItem` 之前完全没处理 `[已中断]`，会让该字面量随 markdown 流入正文渲染，本次一并补齐。`chat.css` 的 `.we-message-interrupted` 块整体替换为 `.we-interrupted-mark` 体系（含 think block 内的紧凑变体）。
- fix(chat,writing): 流式中断后丢弃本轮临时 next_prompt 选项，避免旧选项卡串到下一轮。`frontend/src/pages/ChatPage.jsx` 和 `frontend/src/pages/WritingSpacePage.jsx` 在 `aborted` 事件到达时立即清空页面级临时选项，并在 `onStreamEnd` 检测到 `wasAborted` 时禁止把流中解析出的 `<next_prompt>` 回填成正式 `currentOptions`；这样被中断的 assistant 仍可保留正文，但不会携带后端已明确丢弃的选项。补 `frontend/tests/pages/chat-page.test.jsx` 与 `frontend/tests/pages/writing-space-page.test.jsx` 回归，覆盖“流中出现选项 → aborted → 下一轮发送”场景，确保旧选项不会残留到下一轮。
- chore(llm,assistant): simplify pass。`backend/llm/index.js` 删除 `buildLLMConfig` 中已被 `completeWithToolsDetailed` 内部覆盖的死参数 `toolResultMode`；`backend/llm/tool-loop-control.js` 新增 `TOOL_LOOP_SIGNAL` 常量（`TERMINAL/AWAITING_APPROVAL/PAUSED`），`assistant/server/tools/meta/runtime.js` 三处抛点与 `assistant/server/parent-agent.js` 三处 `err.kind ===` 改用常量。`parent-agent.js` 删除本地 `countChars`，改用 `summarizeMessages(...).chars`。`task-store.js` 合并 `setStatus + setError` 为 `setStatus(id, status, { error })` 单次 persist，删除孤儿 `setError` 导出；`setModelContext` 加 idempotent guard（JSON 浅比较），值不变不落盘。删除 parent-agent / sub-agent 中 `cacheableSystem` 用法的重复叙述性注释（保留 `llm/index.js` 权威版本）。`iter` 参数评估后保留：gemini 用于生成跨轮唯一 tool call id（`gc_${iter}_${idx}`），不是死参数。
- fix(assistant): 父代理上下文压缩在历史被删回阈值内时会清空旧 `modelContext`，避免已删除消息继续通过历史摘要影响后续轮次；普通文本的 `delta` 伪流式在 chunk 之间改为主动 `setImmediate` 让出事件循环，使 `/cancel` 能中途打断后续输出。补 `assistant/tests/parent-agent.test.mjs` 回归，覆盖“截短后清摘要”和“cancel 中断普通文本输出”。
- chore(assistant): 删除 `assistant/tests/harness-audit-report.md` 历史审计快照（基于已废弃的 `main-agent.js` + `resolveToolContext` 双阶段架构，与当前单通道实现矛盾，无权威价值；git 历史可回溯）。
- refactor(llm): 清理写卡助手单通道改造后已无调用方的 `resolveToolContext` 兼容层。删除 `backend/llm/index.js` 的 `resolveToolContext()` 入口、`cloud-router.js` 的 `resolveToolContext` 路由、anthropic/gemini/openai-compatible/ollama/mock 五个 provider 的 `resolveToolContext*` 函数与对应 resolve 分支（含首轮 `max_tokens=1000 / temperature=0` 锁定）。`runToolLoop()` 移除 `mode` 参数（连同 `'complete'|'resolve'` 分支与 `enriched` 状态），`oneTurn(state, defs, iter, config)` 不再接收 `mode`；`stateToMessages` 仅 `completeResultMode='detail'` 时用到。删除 `backend/utils/constants.js` 中只服务 ollama resolve 的 `LLM_TOOL_RESOLUTION_MAX_TOKENS`。清理 `backend/tests/llm/anthropic-tool-loop-cancel.test.js`（仅覆盖 resolve 路径）以及 ollama/openai-compatible/gemini/tool-loop-control 测试中的 resolve 用例；`assistant/tests/cacheable-system.test.js` 文档串描述同步更新；`assistant/tests/harness-audit-report.md` 是历史审计快照，保留原状。`npm run test:backend` / `npm run test:assistant` / `npm run lint` 全绿。
- feat(assistant): 写卡助手任务态改持久化到 SQLite `assistant_tasks` 表，`task-store` 全量改走 DB；启动时先从旧 `.temp/assistant/*.json` sidecar 导入，再 hydrate 到内存。恢复策略调整为 `awaiting_approval` / `paused` 原样恢复可继续交互，`planning` / `executing` 自动转 `failed(interrupted by restart)`；SSE 订阅者仍只保存在内存。
- feat(assistant): 父代理彻底收敛为单通道 tool-loop；`runParentAgent` 不再调用 `llm.resolveToolContext()` + `llm.chat()` 双阶段组合，而是统一走 `llm.completeWithToolsDetailed()` 产出 `{ text, messages }`。普通文本回复改由服务端分片成 `delta` 伪流式下发，`write_plan_doc` / `dispatch_subagent(paused)` / `finalize_task` 命中后本轮立即结束，不再存在“工具后再补第二段 chat”的控制流分叉。
- refactor(llm): `runToolLoop()` 新增 complete detail 返回形态 `{ text, messages }`；`backend/llm/index.js` 新增 `completeWithToolsDetailed()`，保留旧 `completeWithTools()` 的字符串返回兼容调用方；mock/openai-compatible/anthropic/gemini/ollama provider 全部透传 detail 模式。
- test(assistant): 父代理与 assistant HTTP 回归改用 `MOCK_LLM_COMPLETE(_QUEUE)` 断言新单通道链路；补 `runToolLoop completeResultMode=detail` 单测，覆盖结构化返回。
- feat(assistant): 父代理引入显式 `ToolLoopControlSignal` 控制流短路，`write_plan_doc` / `dispatch_subagent(paused)` / `finalize_task` 成功后直接透传出 `runToolLoop`，`runParentAgent` 不再依赖 `task.status` 事后嗅探来决定是否跳过 Step 2；meta tool runtime 也从 `parent-agent.js` 拆到 `assistant/server/tools/meta/runtime.js`。
- feat(assistant): 父代理新增上下文压缩与预算日志；`task.messages` 继续保留完整历史，但发给模型前会把超阈值旧历史压成一条摘要 system message，并把 `{summary,summarizedUntilMessageId,sourceMessageCount,sourceChars}` 持久化到 `assistant_tasks.model_context_json`；日志补 `contextCharsBefore/contextCharsAfter/summaryUsed/tailMessageCount`。
- test(assistant): 更新 task-store/parent-agent/hydrate 回归，覆盖 SQLite 恢复、旧 sidecar 导入、meta 工具控制流信号与长上下文摘要路径。

- refactor(llm): OpenAI-compatible provider 迁移到 runToolLoop 4 原语(initState/oneTurn/appendToolTurn/completeNoTools/stateToMessages);completeOpenAICompatibleWithTools 与 resolveToolContextOpenAI 改为薄包装;reasoning_content 透传(循环内 assistantBlock + 终态 <think>...</think> 拼接)与 4xx 行为差异(complete 400/422 fallback、resolve 任意非 ok 抛错)均保留;executeToolCall 不再被引用(cancel 透传/普通错误字符串化 由 runToolLoop 统一处理);**顺手统一**: resolve 路径原本硬编码 `{ Content-Type, Authorization }` headers,迁移后改用 buildOpenAICompatibleHeaders, 与 complete/stream 路径对齐(grok+conversationId 场景下 resolve 也会附加 x-grok-conv-id);279 → 326 行,主要换取删除两份重复 for 循环 + 两条路径 header 一致
- test(llm): 补 OpenAI-compatible 工具循环单测(complete/resolve 两路 11 测,覆盖 reasoning_content 终态/透传、4xx fallback、tool args JSON 解析、cancel 透传基线行为、resolve 首/二轮 max_tokens 切换;另含 1 个 grok header 一致性 skip 测,等迁移后启用),为迁移 runToolLoop 提供回归保护
- refactor(llm): Ollama provider 迁移到 runToolLoop 4 原语(initState/oneTurn/appendToolTurn/completeNoTools/stateToMessages);completeWithTools 与 resolveToolContext 改为薄包装;callWithTools 保留为 fetch+4xx 降级辅助;resolve 路径 cancel 透传由 runToolLoop 统一处理(原 catch 字符串化喂回 → 透传,小幅修复);191 → 235 行,但删除了两份重复 for 循环
- test(llm): 补 Ollama 工具循环单测(complete/resolve 两路 11 测,覆盖 4xx fallback、tool args JSON 解析、cancel 透传基线行为、resolve 首/二轮 max_tokens 切换),为迁移 runToolLoop 提供回归保护
- refactor(llm): Gemini provider 迁移到 runToolLoop 4 原语(保留 thought_signature 与 nativeContents 原生数组);completeGeminiWithTools 与 resolveToolContextGemini 改为薄包装,删除两份重复 for 循环;cancel 透传统一在 runToolLoop 中处理(complete 路径补齐 cancel 透传);complete 模式 4xx fallback 仍走 initialContents,resolve 模式 4xx 由原 throw 改为 fallback(等价"无可 enrich",Task 4 已批准的差异)
- test(llm): 补 Gemini 工具循环单测(thought_signature/fallback/cancel),覆盖 completeGeminiWithTools 与 resolveToolContextGemini 的基线行为,为迁移 runToolLoop 提供回归保护
- refactor(llm): tool-loop-control.js 暴露 runToolLoop 骨架;Anthropic provider 迁移到 4 原语接口(initState/oneTurn/appendToolTurn/completeNoTools/stateToMessages),删除 completeAnthropicWithTools 与 resolveToolContextAnthropic 内的重复循环

- feat(assistant): 父子代理向 llm.* 传 cacheableSystem 选项，触发 Gemini explicit cache 摊薄稳定 prefix 成本

- refactor(assistant): meta 工具 5 件套 schema 外移到 assistant/server/tools/meta/ 子目录
- refactor(assistant): SSE 事件类型集中到 sse-events.js 常量,前后端共享
- test(assistant): 后端测试沙箱自动注入 ASSISTANT_STATE_DIR;server-hooks 子进程同步透传,避免 hydrate 污染默认 .temp/assistant/
- test(assistant): wrapToolEvents cancel 三时机回归保护(前/中/后)
- test(assistant): 父代理在 dispatch_subagent 软失败时不应推进到 completed(回归保护)
- test(assistant): 父代理 happy path 集成测(write_plan_doc → approve → dispatch_subagent → finalize_task)
- fix(assistant): task-store 单测改用动态 import,避免 ESM hoist 导致 hydrate 污染真实 .temp/assistant/
- test(assistant): task-store 单测走临时目录,不污染 .temp/assistant/
- refactor(assistant): TERMINAL_TASK_STATUSES 统一在 task-store.js 导出,消除 routes 重复定义
- feat(assistant): 进程启动时 hydrate 磁盘任务态,非终态统一转 failed 避免 orphan 任务
- fix(assistant): persist 序列化补 error 字段;setStatus no-op 时跳过落盘
- feat(assistant): task-store 每次改写后落 JSON sidecar 到 .temp/assistant/<taskId>.json(写入原子,支持 ASSISTANT_STATE_DIR 覆盖)
- fix(llm): completeWithTools 重试 catch 透传 ToolLoopCancelledError,与 resolveToolContext 对齐,避免 cancel 触发无谓重试
- fix(assistant): 子代理工具循环响应父代理 cancel,user 点清空后正在落库的子代理立即中断
- fix(llm): anthropic provider resolveToolContext 透传 ToolLoopCancelledError,与 completeWithTools 对齐
- fix(assistant): task_created SSE 事件补齐 runId,与 runParentAgent 内部 run 共享同一 runId
- chore(assistant): 补 callId 形态断言测试,防止默认实现回退到 Math.random
- test(assistant): 强化 runId 断言为全部事件检查,杜绝偶然事件遮蔽
- feat(assistant): 写卡助手父代理执行加入 runId,贯穿日志与 SSE 事件便于排查
- fix(assistant): parsePlanDoc 补 completedAt 解析,replace_steps id 自动生成防碰撞 (intent/assumptions/log 重渲染丢失为预存在限制,留待后续修复)
- fix(assistant): edit_plan_doc.replace_steps 强制保留已完成步骤，防止误覆盖
- refactor(assistant): 工具适配器文件按项目惯例改名 _adapter → adapter
- refactor(assistant): 下沉 toLLMTool / wrapToolEvents 到 assistant/server/tools/adapter.js，父子代理共享；wrapToolEvents 通过 opts 注入 cancelCheck / onCancelLog，callId 改用 crypto.randomUUID
- fix(assistant): 同步 parent-agent.md 与 dispatch_subagent schema 中的返回形态描述（测试通过 sub-agent hard-fail 路径间接覆盖软失败映射；直接 mock soft-fail 受 ESM 限制暂留）
- fix(assistant): dispatch_subagent 软失败统一返回 {ok:false},避免父代理 LLM 误判推进

## 2026-05-11 fix(assistant): 取消真正中断 provider tool loop，清空不再篡改终态任务

**问题**：
- 写卡助手任务被取消后，`resolveToolContext()` 内的 provider tool loop 仍会把 `{ ok:false, error:'task cancelled' }` 当普通 tool result 继续喂回模型，导致取消后还会额外消耗若干轮 LLM / tool iteration。
- 面板点击“清空”时，只要还有 `taskId` 就会调用 `/cancel`；对已 `completed` / `failed` 的任务，这会把终态结果改写成 `cancelled`，并删除 plan doc。

**修复**：
- 新增 `backend/llm/tool-loop-control.js`，定义 `ToolLoopCancelledError`。
- `assistant/server/parent-agent.js`：`wrapToolEvents` 在任务已取消或工具中途取消时，改为抛出 `ToolLoopCancelledError`，不再返回普通 `{ ok:false }`；`runParentAgent()` 捕获该取消哨兵后直接收尾并结束 SSE，不落 `task_failed`。
- `backend/llm/providers/_shared/fetch-utils.js` 与 anthropic / gemini / ollama provider 的 `resolveToolContext` 工具执行路径：遇到 `ToolLoopCancelledError` 直接上抛，立即终止 provider tool loop；其他工具异常仍维持原有“字符串化失败结果”语义。
- `backend/llm/index.js`：`resolveToolContext()` 识别取消哨兵，单独记录 `RESOLVE_TOOLS CANCELLED`，不包成普通 LLMError。
- `assistant/server/routes.js`：`POST /agent/:taskId/cancel` 对 `completed / failed / cancelled` 改为 no-op，不删除 plan doc、不回写状态。
- `assistant/client/AssistantPanel.jsx`：`handleReset()` 只对 `planning / awaiting_approval / executing / paused` 调 `/cancel`；终态任务仅清本地 UI。

**验证**：
- `node --test assistant/tests/parent-agent.test.mjs assistant/tests/routes-http.test.js`
- 手动：让写卡助手进入工具循环后点击“清空”或“停止”，确认旧任务不再继续发起后续 tool call；对已完成任务点“清空”，重新打开面板后其服务端状态与 plan doc 仍保留原终态。

## 2026-05-11 fix(assistant): 写卡助手响应中点"清空"未真正中断后端

**问题**：写卡助手正在响应时点击"清空"，再发新任务，旧任务仍会继续执行（如继续调用 `apply_*` 落库），表现为"清空后助手还在完成清空前的任务"。

**根因**：`handleReset` 只 `abortRef.current.abort()` + 本地 `reset()`，没调 `cancelTask(taskId)`。后端 `runParentAgent` 的 LLM 工具循环并不会因 HTTP 响应关闭而停止（Node 不会自动取消已 await 的 Promise），于是 `wrapToolEvents` 包装下的 `apply_world_card` / `apply_character_card` 等仍按部就班把变更落库。

**修复**：
- `assistant/client/AssistantPanel.jsx`：`handleReset` 中先 `cancelTask(taskId)`（即触发后端 `/cancel`：删除 plan-doc、`setStatus('cancelled')`、emit `task_cancelled`），再 abort 本地 SSE 并 `reset()`。
- `assistant/server/parent-agent.js`：`wrapToolEvents` 新增 `task` 参数：
  - **前置闸门**：执行前判断 `task.status === 'cancelled'` 即短路返回 `{ ok:false, error:'task cancelled' }`，跳过工具实际执行与 `tool_call_*` 事件。
  - **后置闸门**：`tool.execute` 启动后用户点击清空，本次落库无法回滚（better-sqlite3 同步事务 + `apply_*` 不接受 AbortSignal），改为返回 `{ ok:false, error:'task cancelled mid-execution' }` 并把 `tool_call_completed.success=false`：(a) UI 上把该行标成"已取消"而非绿色成功；(b) 喂给 LLM 失败结果，阻断后续工具链式引用（例如 create world 完成后又 apply character 引用刚 create 的 worldId）。
  - Step 2 流式 `for await` 循环每轮检查 `task.status === 'cancelled'` 立即 break，丢弃剩余 delta。`resolveToolContext` 之后的 `TERMINAL_AFTER_TOOLS` 集合已含 `cancelled`，无需额外处理。

**已知限制**：单个已经进入 `apply_*` 的 DB 写入无法中途取消（同步 sqlite + 现有 apply 接口不支持 AbortSignal）。该写入会完成，但不会被后续工具引用、也不会触发后续工具循环。彻底回滚需把 apply 链路改造为接受 AbortSignal 并在事务边界检查；当前迭代不做。

**验证**：`/worlds` 或 `/characters` 进入聊天 → 给写卡助手布置一个会调用多个 `apply_*` 的任务 → 在流式响应中或工具循环中点击右上角"清空" → 旧任务不再继续落库（数据无新增/变更），新任务从干净状态开始。



**问题**：`/worlds` 拖拽世界卡时，附近卡片让位变成瞬移，丢失左右/上下滑动过渡。

**根因**：`weInkRise` 关键帧把入场动画写在 `transform: translateY(...)` 上，配合 `animation-fill-mode: both` 在动画结束后仍长期把 `transform` 钉在 `translateY(0)`。CSS 动画的级联优先级高于 inline style，dnd-kit 在拖拽中给邻居 inline 设的 `transform: translate3d(...)` 因此完全失效，邻居根本不移动。

（先排查过的 `animateLayoutChanges: () => false` 实际只影响 drop 后的 FLIP 补播，不影响 sorting 期间的 transition；保持原样。）

**修复**：把 `weInkRise` 关键帧的 `transform` 换成独立的 CSS `translate` 属性（两者是合成上独立的属性，互不覆盖）：

```css
@keyframes weInkRise {
  from { opacity: 0; translate: 0 8px; filter: blur(1.5px); }
  to   { opacity: 1; translate: 0 0;   filter: blur(0);     }
}
```

视觉效果完全一致；dnd-kit 设的 inline `transform` 不再被入场动画覆盖，邻居恢复 200ms ease 滑动。

**影响面**：`weInkRise` 共 6 处调用（chat 4、pages 3），均为纯入场效果，不依赖动画结束后的 `transform` 状态。`.we-world-card:hover { transform: translateY(-2px); }` 等 hover transform 与 keyframe `translate` 是独立属性，无冲突。

**验证**：`/worlds` 拖动一张卡，邻居平滑滑动让位；松手 220ms 缓动落定；刷新后顺序持久化。chat 等其他使用 `weInkRise` 的入场动画视觉无变化。

**追加 fix（重排后部分卡闪烁）**：松手后 `setWorlds(finalItems)` 触发 React 重排 DOM，被拖卡之后所有卡的 `:nth-child` 位置都变了，`pages.css` 的 `:nth-child(N) { animation-delay: ... }` 规则使每张卡的 `animation-delay` 被重算成新值。浏览器把已经完成的 `weInkRise` 视作"有变更"，按新延迟回放一次，整片卡同时闪一下入场动画。删除 `:nth-child` 级联延迟规则后，所有卡共用 0ms 延迟，重排时 `animation-delay` 不再变化，不会回放。初次入场不再有 stagger，但卡片仍有 `weInkRise` 基础动画。

**追加 fix（向左换位时右侧邻居仍闪烁）**：上一步压住了 `weInkRise` 重播，但还有第二处闪烁——`useSortable` 的 `animateLayoutChanges: () => false` 禁用了 dnd-kit 的 FLIP。松手瞬间被位移过的邻居 inline `transform` 立刻置 0，而它的 grid 位置又因 `setWorlds` 切到新槽位，新位置 + 残留 transform 出现一帧"双重位移"。移除该覆盖后，默认 `defaultAnimateLayoutChanges` 在 drop 时通过 FLIP 把卡片从旧坐标补一帧反向 transform，再用 200ms 过渡回 0，邻居平滑入位无跳变。

**追加 fix（被拖卡本身也闪一次）**：到此前的几轮都还压不住"被移动的卡 + 右侧邻居"在 drop 后再闪一次入场动画。继续在 `weInkRise` 与 dnd-kit 之间打补丁性价比已经不高，最后干脆把 `.we-world-card` 的 `animation: weInkRise ...` 整条删掉。世界卡入场不再有飘入动效，但拖拽彻底干净：FLIP 平滑入位、`opacity`/`transform` 不被 keyframe 钉死、DOM 重排也不再触发任何 keyframe 重播。其他用 `weInkRise` 的地方（chat 等）不受影响。

**追加 fix（透明占位 + 落位闪烁）**：

- 第一版补丁用 `[data-dragging] { animation: none }` 释放 opacity，但松手时 `data-dragging` 被移除，animation-name 从 `none` 切回 `weInkRise`，浏览器视为新动画重新跑 600ms，期间 opacity 0→1 + translate 8px→0 导致占位实体化+位置闪烁，并与 DragOverlay 副本 220ms 飞回叠在一起看起来重叠。
- 改用关键帧不涉及的 `visibility` 隐藏占位：拖拽中 inline `visibility: hidden`；`dropAnimation.sideEffects` 也改成 `active: { visibility: 'hidden' }`，覆盖 220ms 落位期。`visibility` 不在 `weInkRise` 关键帧里，不被 CSS 动画级联钉死，也不触发 animation 重播。透明占位 + 无闪烁同时成立。

## 2026-05-11 fix(writing): 写作模式 {{char}} 不再被同化成"叙述者"

**问题**：写作模式下，世界条目 / 全局提示词 / 历史记忆里所有 `{{char}}` 占位符都被统一替换成字面量"叙述者"，不再对应任何角色卡名字。

**根因**：commit `40e4198` 删除 `writing_session_characters` 表后，`assembler.buildWritingPrompt` 失去"按激活角色逐个展开 {{char}}"的能力，简化成 `tv = applyTemplateVars(text, { char: '叙述者' })`。所有共享段落（[1] 全局 / [2] 常驻条目 / [8-11] 召回 / [13] post / [14] 当前消息）的 {{char}} 都被同化。而 `[7] nearby_characters` 拼成一个大块后再走同一个 tv()，nearby 自己 persona 文本里的 {{char}} 也被替换成"叙述者"而非该 nearby 自己的名字。

**修复**
- `backend/utils/template-vars.js` + `frontend/src/utils/template-vars.js`：`ctx[key] === null` 视为"不替换该占位符"（保留字面量），与缺省/`undefined`（回退空串后替换）的语义区分开。
- `backend/prompts/assembler.js`：写作模式 tv 改用 `char: null`，让 {{char}} 在共享段落里保留字面量交给 LLM 上下文判断。
- `backend/memory/recall.js`：`renderNearbyCharacters` 在拼装每个 nearby 块之前，先用 `applyTemplateVars(persona, { char: nearby.name })` 按本 nearby 自己的名字替换其 persona 文本里的 {{char}}，避免上层 tv() 再次扫到。
- `backend/tests/prompts/assembler.test.js`：更新写作模式断言（{{char}} 保留字面量）。

## 2026-05-11 fix(assistant): 同一 session 内第二个任务的 plan_doc 未显示

**问题**：助手在同一会话内连续接两个需要审批的任务时，第二个任务的「计划文档」在审批按钮上方不显示。

**根因**：`useAssistantStore.js` 处理 `plan_doc_updated` 事件时，用硬编码 id `'plan-doc'` 在 messages 中查找复用，命中的是上一个任务遗留在历史中的旧 plan_doc 行，新内容被就地写回旧位置（滚动视口外），新任务底部因此看不到计划。

**修复**：plan_doc 行的 id 改为按 taskId 区分（`plan-doc-${taskId}`）。`assistant/client/useAssistantStore.js`：第 90–104 行。旧任务的 plan_doc 行保留在历史中作为记录，新任务追加自己的行到底部。

## 2026-05-11 fix(assistant): 4 个体验问题集中修复

**问题**
1. 写卡助手成功写入世界卡 / 角色卡 / 用户卡 / 全局设置 / CSS / 正则后，主界面列表必须手动刷新页面才能看到新内容。
2. 浏览器刷新后助手对话历史完全丢失（应保留，直到用户主动点「清空」）。
3. 进入 `awaiting_approval` 等待确认计划期间，输入气泡区的「…」省略号气泡常驻不消失（LLM 已经不再吐 token）。
4. 父代理 Step 2 流式文本里偶现 `<｜DSML｜tool_calls>...<｜DSML｜invoke name="dispatch_subagent">...` 一类的原始工具调用 token 泄漏到普通文本。

**修复**
- `assistant/client/useAssistantStore.js`：新增 `TOOL_REFRESH_EVENTS` 映射，`tool_call_completed`（success）时按工具名实时派发 `we:world-updated` / `we:character-updated` / `we:persona-updated` / `we:css-updated` / `we:regex-updated` / `we:global-config-updated`，不再等到 `task_completed`。`partialize` 扩展为持久化 `messages`（user / assistant 文本），任务态字段（taskId / status / planDoc / 等）不持久化；新增 `sanitizeMessagesForPersist` 与 `onRehydrateStorage` 兜底清洗，去除 plan_doc / tool_call / step 占位行与残留 streaming 标志。新增并导出 `stripToolCallLeakage`：移除 `<｜DSML｜...｜>` 特殊 token 与裸 `<tool_calls>/<invoke>/<parameter>` XML（含未闭合尾巴）。
- `assistant/client/AssistantPanel.jsx`：移除基于 `status === 'completed'` 的总派发（由 tool_call_completed 增量派发替代）。`pendingAssistant` 条件加上 `status === 'planning'`，仅 LLM 真的在吐 token 的窗口显示「…」。
- `assistant/client/MessageList.jsx`：`parseStreamingBlocks` 调用前先 `stripToolCallLeakage` 兜底。
- `backend/utils/constants.js`：新增 `LLM_TOOL_RESOLUTION_MAX_ITERATIONS = 25`，替换 4 个 provider（anthropic / openai-compatible / gemini / ollama）中硬编码的 `for (let i = 0; i < 5; i++)` 工具循环上限（写卡助手多步 dispatch_subagent 场景 5 轮远远不够，触顶后 Step 2 不再传 tools，模型把工具调用以原始 token 形式吐到普通文本，造成 DSML 泄漏）。
- `frontend/src/App.jsx`：在应用顶层挂全局 `we:css-updated` / `we:regex-updated` 监听 —— 命中后分别调用 `refreshCustomCss(appMode)` 与 `invalidateCache() + loadRules(appMode)`。Codex review 指出：原本只在 `CustomCssManager` / `RegexRulesManager` 内部监听时，用户停在聊天/世界页（设置组件未挂载）就接不到事件，CSS 注入与正则缓存仍是旧的。
- `frontend/src/components/settings/CustomCssManager.jsx` / `RegexRulesManager.jsx`：同时保留本地监听以刷新设置面板自己的列表 state（App 层只负责注入 / 缓存失效，不更新 manager 的本地列表）。`useSettingsConfig` 已有 `we:global-config-updated` 监听，无需补。

**结果**：助手写卡后主界面实时刷新；刷新页面对话历史保留；等待确认计划期间不再有「…」假动效；DSML 工具调用 token 不再泄漏到文本。

## 2026-05-11 docs(readme): 重构结构、补徽章与目录锚点

**变更**
- `README.md`：开头新增 License / Release / Stars / Node ≥18 徽章行，主图下方加 TOC 锚点导航。
- 章节顺序调整为「卖点 → 上手 → 能力 → 技术 → 导入导出 → 文档 → 开发与构建 → 社区」，递进更清晰。
- 合并原"开发命令"与桌面端数据目录段落为"开发与构建"，消除两处重复，数据目录用列表呈现。
- 不改动任何能力描述、命令、链接与截图路径。

## 2026-05-11 fix(release): 在 npm version 提交前同步子包版本号

**问题**：根 `package.json` 把自动同步挂在 `postversion`，执行时机晚于 `npm version` 创建 commit/tag，导致子包 `package.json` 的版本变更不会进入 release tag。

**修复**
- 根 `package.json`：保留手动 `version:sync` 脚本，但把自动钩子从 `postversion` 改为 `version`。
- `sync-version.mjs` 继续读取已经更新过的根版本号，并在 release commit/tag 创建前把 `frontend/backend/desktop/assistant/client` 等子包版本一并改好。

**结果**：后续执行 `npm version patch|minor|major` 时，根包与子包版本会一起进入同一版 release commit/tag。

## 2026-05-11 refactor: LLM provider 按文件夹分包 + 散落常量收敛 + lint 兜底

**动机**：清扫一批仍硬编码在多处的常量（导入导出格式版本、Anthropic API 版本头、附件大小、本地 LLM 默认 URL），同时把 `backend/llm/providers/` 从扁平结构改为"每个 provider 一个文件夹"，让每个 provider 的私有常量自然落在自己的 `constants.js`。

**Provider 目录重组**（行为不变，仅文件位置与导入路径调整）
- 新结构：`_shared/{base-urls,fetch-utils,thinking-budget,converters,cache-usage}.js` + `{anthropic,openai-compatible,gemini,ollama,mock}/index.js`（gemini 含 `cache.js`、openai-compatible 含 `thinking.js`、anthropic 含 `constants.js`）+ `cloud-router.js`（原 `openai.js`，重命名以反映分发器职责）。
- 原 `_utils.js` 拆为 `_shared/base-urls.js`（DEFAULT_BASE_URLS / OPENAI_COMPATIBLE / getBaseUrl）、`_shared/fetch-utils.js`（parseSSE / apiError / extractProviderError / parseDataUrl / executeToolCall / safeParseJson）、`_shared/thinking-budget.js`（resolveThinkingBudget，Anthropic + Gemini 共用）、`openai-compatible/thinking.js`（applyThinkingToOpenAICompatibleBody + resolveQwenBudget，OpenAI-compatible 系专属）。
- 调用方更新：`backend/llm/index.js`、`backend/routes/config.js`、`backend/llm/embedding.js`、3 个 provider 相关测试文件。

**常量收敛**
- 新增 `backend/services/import-export-constants.js`，导出 4 个 `EXPORT_FORMAT_*`；`import-export.js` / `import-export-validation.js` 共 9 处字面量改用常量。
- 新增 `backend/llm/providers/anthropic/constants.js`，定义 `ANTHROPIC_API_VERSION` / `ANTHROPIC_PROMPT_CACHING_BETA`；`anthropic/index.js`（5 处）+ `routes/config.js`（1 处）改用常量。
- 新增 `shared/runtime-constants.mjs`，统一 `MAX_ATTACHMENT_SIZE_MB` / `MAX_ATTACHMENTS_PER_MESSAGE` / `OLLAMA_DEFAULT_BASE_URL` / `LMSTUDIO_DEFAULT_BASE_URL` 单一来源；`backend/utils/constants.js` 与 `frontend/src/utils/constants.js` 双侧 re-export。
- `frontend/src/components/chat/InputBox.jsx` 用 `MAX_ATTACHMENT_SIZE_MB` / `MAX_ATTACHMENTS_PER_MESSAGE` 替换硬编码；toast 文案改模板字符串。
- `frontend/src/components/settings/SettingsConstants.js` 改 import `OLLAMA_DEFAULT_BASE_URL` / `LMSTUDIO_DEFAULT_BASE_URL`。

**Lint 兜底**（轻量 no-restricted-syntax）
- `backend/eslint.config.js` 新增 10 条字面量禁用规则（4 个 format 字符串 + 2 个 API host + 2 个 Anthropic header + 2 个本地 LLM URL），并在常量定义文件 + `routes/config.js` 单独豁免。
- `frontend/eslint.config.js` 现有 `no-restricted-syntax` 数组追加 2 条（本地 LLM URL）。

**有意保留的 drift**：`routes/config.js` 内 `OPENAI_COMPATIBLE_BASE_URLS` 与 `_shared/base-urls.js` 内 `DEFAULT_BASE_URLS` 看似重复，但 `kimi-coding` 的 `/models` 端点（`/coding/v1`）与 chat 端点（`/coding`）路径不同，两份映射必须独立维护。`config.js` 因此在 lint 豁免名单内，并在文件内加注释。

**验证**：`npm run check` 全过（backend 445 / frontend 151 / assistant 112 测试全绿，lint clean）。lint 守门通过临时探针文件验证有效（往 services/ 投放含 `'worldengine-character-v1'` 的文件能触发错误）。

## 2026-05-11 chore: 统一版本号来源（根 package.json）

**动机**：版本号原先在 4 个 `package.json` + `AboutPanel.jsx` 共 5 处硬编码，每次发版要手改多处。

**改动**
- `frontend/vite.config.js`：读取根 `package.json`，通过 `define` 注入 `__APP_VERSION__` 全局常量。
- `frontend/src/components/settings/AboutPanel.jsx`：版本号改读 `__APP_VERSION__`，移除硬编码 `0.1.1`。
- `frontend/eslint.config.js`：将 `__APP_VERSION__` 加入 globals，避免 `no-undef` 误报。
- 新增 `scripts/sync-version.mjs`：以根 `package.json` 为唯一来源，同步到 frontend/backend/desktop/assistant/assistant-client 五个子包。
- 根 `package.json` 新增 `version:sync` 脚本和 `version` 钩子（`npm version` 在创建 release commit/tag 前自动同步）。

**使用**：改版本只需改根 `package.json`，或跑 `npm version <new>`；显示位会自动跟随重新构建。

## 2026-05-11 fix(assistant): finalize_task summary 反转义字面换行符

**问题**：写卡助手任务结束的总结气泡里出现大量字面 `\n`，导致整段文本不换行。模型在 `finalize_task` 的 `summary` 参数里把转义符号自身又转义了一次（`"\\n"`），JSON 解析后落入消息内容的就是字面 `\` + `n`。

**改动**
- `assistant/server/parent-agent.js`：新增 `unescapeLiteralWhitespace`，在 `finalize_task.execute` 写入 `task.messages` 与发 `task_completed/failed/cancelled` 事件前，对 `summary` 做一次轻量反转义（`\\n` / `\\r\\n` / `\\r` → `\n`，`\\t` → `\t`）。
- 只在 `finalize_task` 入口收敛，不影响流式 `delta` 路径（流式 token 本身没有这层 JSON 转义问题）。

**残留风险**：旧任务历史消息里的字面 `\n` 不会被自动清洗，重新加载仍按字面显示——属预期，新任务即可正确换行。

## 2026-05-11 fix(assistant): 写卡助手支持识别和操作非激活玩家卡

**动机**：`list_resources` 没有 `personas` target，`preview_card` / `apply_persona_card` 只能访问当前激活玩家卡，导致助手无法发现或修改世界下的其他玩家卡。

**改动**
- `assistant/server/tools/list-resources.js`：新增 `personas` target（需传 `worldId`），调用 `listPersonas` 返回含 `is_active` 的全列表。
- `assistant/server/tools/card-preview.js`：`preview_card` 新增 `personaId` 参数；persona-card 查询时若传入 `personaId` 则直接定位该玩家卡，否则回退到激活玩家卡（兼容原行为）。
- `assistant/server/tools/apply-persona-card.js`：`apply_persona_card` 新增 `personaId` 参数；update 操作若传 `personaId` 则直接修改指定玩家卡，否则修改激活玩家卡（兼容原行为）。
- `assistant/server/normalize-proposal.js`：persona-card update 路径优先使用 `proposal.personaId` 调 `updatePersonaByIdService`；无 personaId 则走旧路径 `updatePersona(worldId)`，`stateValueOps` 中的 worldId 改从 `updated.world_id` 取。
- `assistant/knowledge/USERCARD.md`：更新 operation 表，说明 personaId 用法和 list_resources personas 用法。

**残留风险**：`normalize-proposal` 的 create 路径在新建 persona 后自动 `setActivePersona`，若未来需要"新建但不激活"的场景需单独处理。

## 2026-05-11 chore(ltm): 长期记忆压缩阈值调整为 >20 行触发、压缩到 <10 行

- `LONG_TERM_MEMORY_MAX_LINES` 50 → 20（超过 20 行即触发压缩，触发条件是硬编码行数检测，不走 LLM）
- `LONG_TERM_MEMORY_TARGET_LINES` 20 → 10（LLM 压缩后 `.slice(0, 10)` 硬截断保底）

## 2026-05-11 fix(suggestion): 补选项成功后立即渲染选项，不等 keepSseAlive 任务关闭连接

**动机**：`onDone` 收到选项后只存入 `pendingOptionsRef`，实际渲染推迟到 `onStreamEnd`；而 `onStreamEnd` 要等 HTTP 连接关闭（即 title/state/chapter-title 等 `keepSseAlive` 异步任务全部完成后 `res.end()` 才触发），延迟通常数秒。

**改动**
- `frontend/src/pages/WritingSpacePage.jsx`：普通生成和续写两处 `onDone` 回调中，当 `options?.length > 0` 时，立即调用 `setCurrentOptions(options)` 渲染，同时保留 `pendingOptionsRef` 供 `onStreamEnd` 兜底幂等写入。

**根因**：`onStreamEnd` = `parseSSEStream` 返回后调用，`parseSSEStream` 读到 stream 关闭，stream 关闭 = `res.end()`，`res.end()` 在 `runPostGenTasks` 所有 `keepSseAlive` 任务完成后才调用。

## 2026-05-11 fix(hooks): 观测事件改非阻塞，附件消息与启动时序修正

**动机**：首版 hooks 接入把观测事件直接串进主时序，导致慢 hook 会卡住异步队列；`message:user:saved` 在附件落盘前触发；fresh data dir 下用户 hook 可能早于 schema 初始化而加载失败。

**改动**
- `backend/utils/async-queue.js`：新增 `emitObserverHook()`，`queue:task:start/done/fail` 改为 fire-and-forget；即使 hook 很慢或异常，也不再阻塞任务 resolve、后续队列任务或 SSE 收尾。
- `backend/services/chat.js`：`saveAttachments()` 改为返回最终相对路径数组，供调用方复用最终态消息对象。
- `backend/routes/chat.js`：`message:user:saved` 挪到附件保存之后触发；若本轮有附件，会先把 `userMsg.attachments` 更新为最终路径数组，再把 payload 发给 hook。
- `backend/utils/hook-loader.js` / `backend/server.js`：`hook-loader` 改为显式导出 `loadUserHooks()`；server 在 `initSchema(db)` 之后再调用，确保用户 hook 启动期可安全查询表。
- `backend/tests/utils/async-queue.test.js`、`backend/tests/routes/chat-extra.test.js`、`backend/tests/server-hooks.test.js`：补队列非阻塞、附件最终态、冷启动 schema 顺序三条回归测试。
- `ARCHITECTURE.md`：同步修正文档中的 hook 加载顺序、`message:user:saved` 语义和 queue 观测事件语义。

**影响**
- `queue:task:*` 明确是“观测型、非阻塞”事件；需要强事务语义的 hook 不应挂在这些事件上。
- `message:user:saved` 现在对附件消息也代表最终 DB 状态，可安全用于镜像/索引/上传处理。

---

## 2026-05-11 feat(hooks): 根目录 hooks/ 系统 — 以会话消息队列为核心

**动机**：允许内部开发者和用户在不改动核心代码的情况下，向会话消息队列注入自定义任务、监听消息生命周期、观测队列任务执行事件。

**改动**
- 新增 `backend/hooks/hook-registry.js` — 通用 hook 引擎（registerHook / runHook / listHooks）
- 新增 `backend/utils/hook-loader.js` — 启动时扫描根目录 `hooks/*.js` 并自动加载
- `backend/server.js` — 新增 `import './utils/hook-loader.js'` 副作用 import
- `backend/utils/async-queue.js` — drain 函数加 `queue:task:start/done/fail` hook
- `backend/services/chat.js` — processStreamOutput 加 `message:assistant:saved` hook
- `backend/routes/chat.js` — POST /chat 加 `message:user:before/saved`；edit-assistant 加 `message:edited`；generate/continue 两处加 `generation:post`
- `backend/routes/writing.js` — generate/continue 两处加 `generation:post`
- `backend/routes/sessions.js` — DELETE /messages/:id 加 `message:deleted`
- 新增 `hooks/` 根目录（README.md + .gitkeep + examples/ 三个示例文件）
- `ARCHITECTURE.md` 新增 §16 Hook 系统

**用户 DIY 方式**：在 `hooks/` 根目录放 `.js` 文件，默认导出 `({ registerHook }) => {}` 函数，重启后端即生效。

**完整事件**：`generation:post` / `message:user:before/saved` / `message:assistant:saved` / `message:deleted` / `message:edited` / `queue:task:start/done/fail`

---

## 2026-05-11 fix(suggestion): 选项区增加末尾闭合检测 + 副模型兜底补齐

**动机**：开启选项功能后，主模型偶发不输出完整的 `<next_prompt>...</next_prompt>`，或被额外的 think/thinking block 干扰，导致前端本轮拿不到选项区。

**改动**
- `backend/services/chat.js`
  - `processStreamOutput()` 改为异步统一出口，chat / writing / continue 共用。
  - 新增“末尾硬检测”：开启 suggestion 时，先剥离 think/thinking block，再检查 assistant 文本 `trimEnd()` 后是否以 `</next_prompt>` 结尾。
  - 若未闭合：调用一次 `llm.complete()` 兜底补齐选项块。聊天走 `configScope='aux'`，写作走 `configScope='writing-aux'`，只传“本轮 user message + assistant message”。
  - fallback 失败或返回非法内容时仅 warn，不阻断主回复落库。
- `backend/prompts/templates/shared-suggestion-fallback.md`
  - 新增副模型专用模板，基于 `shared-suggestion.md` 收窄成“只输出一个完整 `<next_prompt>` 块，不重写正文”。
- `backend/routes/chat.js` / `backend/routes/writing.js`
  - 主生成、续写、重生成路径全部接入新的异步后处理。
  - `continue` 先走后处理再 merge 回最后一条 assistant，并覆写 `messages.next_options`。
  - `regenerate` / 无请求体重放场景会从当前 session 回推最后一条 user 消息，供 fallback 使用。
  - 当真正进入补选项分支时，先推 SSE `suggestion_fallback_started`，用于前端 toast 感知。
  - `frontend/src/api/stream-parser.js` / `frontend/src/pages/ChatPage.jsx` / `frontend/src/pages/WritingSpacePage.jsx`
  - 前端识别 `suggestion_fallback_started` 事件，并在 chat / writing 页面各自弹出“本轮选项缺失，正在补全…” toast。
  - 后续补充 `suggestion_fallback_succeeded` / `suggestion_fallback_failed`，补选项成功与失败都会 toast，避免用户只看到“补中”却没有结果反馈。
- Prompt / 落库语义澄清
  - fallback 补出来的选项不会进入 `[14]` 当前 user 段；下一轮会作为上一条 assistant history 的一部分，在 `assembler.js` 的 `[12]` 历史消息阶段重新拼成 `<next_prompt>...</next_prompt>` 一起送入上下文。
  - DB 里 assistant 正文和选项分字段存：`messages.content` 保存可见正文，`messages.next_options` 单独保存三选项数组；不会把 `<next_prompt>` 原样并回正文落库。
- 测试与文档
  - `backend/tests/services/chat.test.js` 补：正常闭合不触发 fallback、fallback 成功、fallback 失败、think block 剥离检测。
  - `backend/tests/routes/chat.test.js` / `backend/tests/routes/writing.test.js` 补：chat generate、writing generate、writing continue 的补齐回归，并断言 SSE 发出 `suggestion_fallback_started` / `suggestion_fallback_succeeded` / `suggestion_fallback_failed`。
  - `ARCHITECTURE.md` / `backend/prompts/README.md` / `backend/prompts/templates/README.md` 同步说明新链路与模板。

## 2026-05-11 fix(state-bar): 整理中时机对齐 + 失败 Toast 通知

**动机**："整理中" overlay 在状态整理 LLM 完成后才出现（时机错误），且 `updateAllStates()` 失败时前端无任何反馈（静默失败）。

**改动**
- `backend/utils/post-gen-runner.js`：新增 `TaskSpec.startSseEvent` 字段——任务被 dequeue 并实际开始执行时（调用原 fn 之前）立即推送该 SSE 事件；`keepSseAlive` 任务失败时若 `tracksState=true`，额外推送 `state_update_failed` SSE 事件。
- `backend/routes/chat.js` / `backend/routes/writing.js`：all-state 任务 spec 加 `startSseEvent: 'state_queued'`（两处 generate/continue）。
- `frontend/src/api/stream-parser.js`：新增 `state_queued` → `onStateQueued?.()`、`state_update_failed` → `onStateUpdateFailed?.(evt)` 分发。
- `frontend/src/store/index.js`（锁定文件，最小改动）：追加 `stateQueuedRefreshTick` + `triggerStateQueued()`。
- `frontend/src/hooks/useSessionState.js`：新增第 4 参数 `stateQueuedTick`；原单一 effect 拆分为两个——Effect A（`stateQueuedTick` 变化 → 立即 `setIsUpdating(true)`），Effect B（`stateTick` 变化 → fetch 数据 → `setIsUpdating(false)`）；sessionId 切换时同步重置 `stateQueuedTickRef`。
- `frontend/src/components/book/StatePanel.jsx`：从 store 读 `stateQueuedRefreshTick` 作为第 4 参数传给 hook。
- `frontend/src/components/book/NearbyPanel.jsx`：新增 `stateQueuedTick` prop，透传给 hook。
- `frontend/src/pages/ChatPage.jsx`：generate/continue 回调新增 `onStateQueued` → `triggerStateQueued()`、`onStateUpdateFailed` → Toast 错误 + `triggerMemoryRefresh()`。
- `frontend/src/pages/WritingSpacePage.jsx`：新增 `stateQueuedTick` state，generate/continue 回调新增 `onStateQueued` / `onStateUpdateFailed`，`NearbyPanel` 补传 `stateQueuedTick` prop。

**注意**：`writing.js:711` 的直接 `enqueue()`（编辑消息路径）为 REST 端点无 SSE，不支持 startSseEvent，保持原样。

## 2026-05-11 feat(state-updater): 状态栏更新增加失败重试和 JSON 宽解析兼容

**动机**：LLM 偶发返回带尾部逗号、单行注释或末尾截断的 JSON 时，原实现直接放弃整轮状态更新（`return`），导致状态丢失无感知。

**改动**
- `backend/utils/constants.js`：新增 `STATE_UPDATE_JSON_RETRY_MAX = 2`（JSON 解析失败时额外重试次数）。
- `backend/memory/combined-state-updater.js`：
  - `repairTruncatedJson` 升级为 `repairJsonIssues`（单遍状态机），新增处理：尾部逗号（`{"a":1,}`）、字符串外单行注释（`// ...`），原截断补全功能保留；进入 `inString` 后所有修复逻辑跳过，不破坏字符串内容。
  - 提取 `extractJsonPatch(raw, sid)` 内部函数，封装 stripThink → 提取 JSON → 标准解析 → repairJsonIssues 修复解析全链路；返回 null 表示解析彻底失败。
  - LLM 调用+解析段改为 `for (attempt <= STATE_UPDATE_JSON_RETRY_MAX)` 重试循环：JSON 解析失败时记 `JSON RETRY n/N` warn 日志并重新调用 LLM；LLM API 本身失败（`!raw`）不触发重试；全部尝试耗尽后仍失败才记 `JSON PARSE FAIL`。
  - 压缩路径（`compressOverLimitFields`）的修复调用同步从 `repairTruncatedJson` 更新为 `repairJsonIssues`。

## 2026-05-11 fix(chat): 流式输出中途刷新后上一轮选项卡重复出现

用户反馈：在 assistant 给出选项卡后点击其中一项，新一轮流式输出中刷新页面，刷新后底部又出现了"上一轮"的同一组选项卡——本应已被消费掉。

**根因**：`frontend/src/pages/ChatPage.jsx` 的 `onMessagesLoaded` 回调用 `[...msgs].reverse().find(m => m.role === 'assistant')` 取**最近一条 assistant**，只要它带 `next_options` 就恢复到底部活跃 `OptionCard`。当用户已选中选项后写入了新的 user 消息，但新一轮 assistant 流式被中断且无任何已落盘内容时（`backend/services/chat.js` 的 `if (content)` 守卫会跳过保存），DB 末尾仍然是"上一轮 assistant + 用户的选择 user 消息"，前端误以为选项还有效。

**修复**
- `frontend/src/pages/ChatPage.jsx`：`onMessagesLoaded` 改为只看消息列表**最后一条**——只有当 last 是带 `next_options` 的 assistant 时才恢复 `currentOptions`。如最后一条是 user（说明选项已被响应过）或 `[已中断]` assistant（无 `next_options`），则保持空状态。

**未改动的相关点**
- `backend/services/chat.js`：中断且无内容时不写 assistant 占位的现状保留；前端层已能识别"最后一条不是 assistant"，无需后端额外清空 DB。
- `backend/services/chat.js` / `MessageList.jsx` 的冻结卡 (`FrozenOptionCard`) 渲染逻辑与 `suppressLastFrozen` 不受影响，行为一致。

验证：见 `/Users/yunzhiwang/.claude/plans/humble-frolicking-dragon.md` 的"验证方式"小节（手动浏览器复现 + 回归正常通路 + 回归切换历史会话）。

---

## 2026-05-11 fix(prompt-entries): keyword 条目 active_turns=1 实际跨多轮生效

用户反馈关键词条目设 `active_turns=1`（仅当轮）后仍持续多轮注入。

**根因**：`entry-matcher.js` 的 fresh hit 扫描使用最近 5 条消息的滑动窗口（`PROMPT_ENTRY_SCAN_WINDOW=5`）。命中关键词所在的旧消息只要还在窗口内，每轮都被识别为"本轮新命中"，反复刷新 `keyword_active_state` 的 `round` 字段，导致 TTL 永远归零、`active_turns=1` 等不到失效时机。

**修复**
- `backend/prompts/entry-matcher.js`：keyword fresh hit 改为只扫"本轮"最新一条 user / assistant 消息（即与 LLM preflight 同一份 `contextLines` 来源），不再使用 5 条滑动窗口。跨轮持续完全交给 `active_turns` / TTL。
- `backend/utils/constants.js`：删除已不再被引用的 `PROMPT_ENTRY_SCAN_WINDOW` 常量。
- `backend/tests/prompts/entry-matcher.test.js`：更新 active_turns 跨轮测试用例与说明，反映新语义（`active_turns=N` = 命中当轮 + 后续 N-1 轮 carry-over）。
- `SCHEMA.md`：同步 `keyword_active_state` 与 `active_turns` 字段说明。

**新语义**
- `active_turns=1`：仅命中当轮；下一轮新消息不含关键词即失效。
- `active_turns=N (N≥2)`：命中当轮 + 后续 N-1 轮 carry-over，共 N 轮。
- `active_turns=0`：永久。
- AI 回复中出现关键词依旧会触发（fresh hit 同时扫最新一条 assistant 消息）。

验证：`backend && node --test tests/prompts/entry-matcher.test.js` → 21/21 通过。

## 2026-05-11 fix(nearby): 排除玩家被误识别为登场角色

写作模式下副 LLM 偶尔把玩家（persona）写进 `nearby_characters`。Prompt 没显式告知玩家是谁，LLM 仅靠"玩家："对话标签自行判断，识别不稳定。

**修复**
- `backend/prompts/nearby-prompt.js`：`buildNearbyPromptSection` 新增 `opts.playerName` 参数；输出段追加硬性排除规则——玩家是叙事视角主体，名字/对话/动作出现在本轮也不算登场角色。
- `backend/memory/combined-state-updater.js`：写作分支取 `session.persona_id` → `getPersonaById` 解析玩家名，传给 prompt 构造器；`applyNearbyResult` 新增 `playerName` 兜底，丢弃 name 与 playerName 完全相等（trim）的项并 `NEARBY DROP PLAYER` warn。
- `session.persona_id` 为 NULL 或 persona 已删时 `playerName` 为空字符串，回退到通用版排除规则（不带名字），不影响行为。

验证：`npm run lint` 通过；`node --test tests/memory/combined-state-updater-nearby.test.js` 6/6 通过（旧用例签名兼容，未传 playerName 行为不变）。

## 2026-05-11 fix(import-export): persona 排序在导入/导出中保留;同步 CharactersPage 测试

Codex review 指出三处问题:
1. 单卡 `importPersona` 走 `INSERT INTO personas` 时未填 `sort_order`,新导入的 persona 都拿到默认值 `0`,与 `createPersona()` 的"追加到末尾"行为不一致。修复:导入前查 `MAX(sort_order)+1`。
2. 世界卡导出 personas 时未带 `sort_order`,且 `ORDER BY created_at ASC, id ASC`;导入时也不读 `sort_order`。导出再导入会把用户手动调整过的 persona 顺序打乱。修复:导出 SQL 改为 `ORDER BY sort_order ASC, created_at ASC, id ASC`,payload 增加 `sort_order` 字段;导入时按 payload 原值写回(缺省回退到数组下标)。
3. `frontend/tests/pages/characters-page.test.jsx` mock 仍是 `setCurrentPersonaId`、未导出 `importPersona`,导致页面运行时 store/import-export api 缺函数。修复:mock 同步为 `setCurrentWritingSessionId` 与 `importPersona`。

涉及文件:`backend/services/import-export.js`、`frontend/tests/pages/characters-page.test.jsx`、`CHANGELOG.md`。
验证:`npm run lint`、`npm run test` 全 backend 433/0、`vitest run` 全 frontend 151/0。

## 2026-05-11 style(persona-card): 去掉 hover 上移效果

`frontend/src/styles/pages.css` 中 `.we-persona-card:hover` 移除 `transform: translateY(-2px)`，hover 时仅保留阴影变化，不再产生位移。

## 2026-05-11 refactor(nearby): `memory` 改名为 `persona`，语义从交互摘要改为一句话人设；nearby 制卡 description 直接复用 persona

**目标**：让"附近角色"的人设标签贯穿"副 LLM 维护状态 → 主 LLM 沿用人名 → 制卡"全链路；同时把字段语义从"与 user 一句话交互总结"改为"一句话人物设定（性格 / 身份 / 关键标签）"，制卡时 description 直接复用，不再让 LLM 二次创作客观介绍。

**DB**
- `session_nearby_characters.memory` 重命名为 `persona`。`backend/db/schema.js` 在迁移段新增 `ALTER TABLE ... RENAME COLUMN memory TO persona`，通过 `PRAGMA table_info` 守门避免重复执行；CREATE TABLE 也同步改为 `persona`。
- `SCHEMA.md`：`session_nearby_characters` 表 + turn_records.state_snapshot 的 `nearby[]` 块字段名同步。

**Backend**
- `db/queries/session-nearby-characters.js`：`createNearbyCharacter` 参数 `memory`→`persona`；`updateNearbyMemory`→`updateNearbyPersona`。
- `services/writing-sessions.js`：`patchNearbyMemory`→`patchNearbyPersona`；`addSavedFromCharacter` 创建 nearby 时把 `character.description` 拷贝到 `persona`（对称：从 character 进 pool 时把客观介绍当作初始人设）。`buildNearbyRow` 返回字段 `memory`→`persona`。
- `routes/writing.js`：PATCH body 字段名同步。
- `memory/combined-state-updater.js`：pool 渲染、`applyPatch`、新建 transient 全部使用 `persona`；注释中"name/memory/state" → "name/persona/state"。
- `memory/recall.js#renderNearbyCharacters`：渲染行从"记忆：xxx"改为"人设：xxx"。
- `memory/state-rollback.js`：从 snapshot.nearby 重建时读 `n.persona ?? n.memory ?? ''`（兼容旧 turn_record 快照）；新增 nearby 使用 `persona`。
- `memory/turn-summarizer.js`：写入 `state_snapshot.nearby[].persona`。
- `prompts/nearby-prompt.js`：pool 段"记忆：→人设："；契约 `"memory":"新一句话总结" → "persona":"一句话人物设定"`；新登场必填，已有角色仅在身份描述需要补充修正时输出。
- `prompts/nearby-card-prompt.js` + `templates/writing-nearby-card-analyze.md`：模板变量 `MEMORY`→`PERSONA`，文案改为"该角色现有的一句话人设（将作为角色卡 description 的基底）"，输出 JSON 删除 `description` 字段，仅生成 `system_prompt`、`first_message`。
- `services/nearby-card-maker.js`：`analyzeNearbyForCard` 把 `nearby.persona` 透传给 prompt；返回 `description = nearby.persona`（不再依赖 LLM 输出 description）。

**Frontend**
- `api/session-nearby.js`：`patchNearbyMemory` → `patchNearbyPersona`，body key 改 `persona`。
- `components/book/NearbyCharacterBlock.jsx`：变量 `memoryDraft`/状态/标签"记忆"→"人设"；占位文案改"一句话人物设定（性格 / 身份 / 关键标签）…"；空态"（无记忆）"→"（无人设）"；日志 key 改 `nearby.persona.update_failed`。
- `index.css`：5 个 class `.we-nearby-memory*` 全部改名 `.we-nearby-persona*`。

**Tests**
- 同步更新：`tests/db/queries/session-nearby-characters.test.js`、`tests/services/nearby-characters.test.js`、`tests/services/nearby-card-maker.test.js`（analyze 测试不再 mock LLM 的 description；用 character.description 作为初始 persona 验证透传链路）、`tests/memory/state-rollback.test.js`、`tests/memory/combined-state-updater-nearby.test.js`。
- 现状：`npm run test:backend` 436 tests / 433 pass / 0 fail / 3 skipped；`npm run test:frontend` 151 pass。

验证：
1. 重启后端，原有 DB 自动迁移 `memory → persona`（PRAGMA 守门）；
2. 写作模式触发副 LLM 状态更新 → 检查 `data/logs/worldengine-*.log` 主 prompt 含 `<nearby_characters>` 段，每条角色显示"人设：xxx"；
3. 点击 nearby 角色的人设编辑（之前的"记忆"位置），可保存并立即回显；
4. nearby 角色调用"分析为角色卡" → 弹窗 description 字段等于该 nearby 的 persona 文本，system_prompt 由 LLM 扩写。

## 2026-05-11 fix(import-export): 玩家卡独立格式落地，补齐世界/角色导出遗漏字段

导入导出这一层长期漂移已收口：

- `backend/services/import-export.js`
  - 玩家导出从旧的伪角色卡改为独立 `worldengine-persona-v1` / `.wepersona.json`，导出当前 active persona 的 `name/description/system_prompt/avatar(_base64/_mime)` 与 `persona_state_values`
  - 新增 `importPersona(worldId, data)`，支持两类输入：新 `.wepersona.json`；旧 `.wechar.json` 角色卡兼容导入为 persona
  - `exportCharacter` / `importCharacter` 补齐 `description`、`post_prompt`
  - `exportWorld` / `importWorld` 补齐 `personas[].description/avatar*` 与 `characters[].description/post_prompt`
- `backend/services/import-export-validation.js`：新增 `validatePersonaImportPayload`
- `backend/routes/import-export.js`：新增 `POST /api/worlds/:worldId/import-persona`
- 前端：
  - `frontend/src/api/import-export.js` 新增 `importPersona`
  - `CharactersPage` 的玩家导入改走后端 `import-persona`，`accept` 扩为 `.wepersona.json,.wechar.json`
  - `PersonaEditPage` 导出文件名改为 `.wepersona.json`
  - `ImportExportPanel` 文案修正：写作全局导出实际包含 `writing.llm`，但仍不含 API Key
- 文档：
  - `SCHEMA.md` 新增玩家卡格式章节，更新世界卡/角色卡样例字段
  - 修正 `SCHEMA.md` 里“每个世界一对一持有 persona”的过时描述
  - `ARCHITECTURE.md` 记录玩家卡新格式与旧 `.wechar` 兼容导入
- 测试：
  - `backend/tests/services/import-export-roundtrip.test.js` 新增 persona round-trip，并覆盖 persona/world/character 新字段
  - `backend/tests/routes/import-export.test.js` 新增玩家导出/导入路由与非法格式分支
  - `frontend/tests/api/import-export.test.js` / `frontend/tests/pages/persona-edit-page.test.jsx` 同步更新新 API 与新后缀

验证：
- `node --test backend/tests/services/import-export-roundtrip.test.js backend/tests/routes/import-export.test.js`
- `cd frontend && npx vitest run tests/api/import-export.test.js tests/pages/persona-edit-page.test.jsx`

## 2026-05-11 fix(writing): 写作主 prompt 注入 nearby 状态段，修正下一轮正文给同一角色起新名

**现象**：写作模式下，nearby 状态栏里的角色名（副 LLM 创建时合理虚构，如"林婉清"）和下一轮正文里的人名（如"叶诗晴"）不一致。

**根因**：`buildWritingPrompt` 完全没有把 nearby 池注入主写作模型上下文（旧策略：nearby 仅由副 LLM 维护，不进主 prompt）。主模型生成下一轮时只能看到最近 12 轮历史正文，正文里之前是"短发女子/那女人"等模糊描述、没有真名，于是主模型自由发挥重新起名；下一轮状态更新副 LLM 又把新名字按"稀疏 patch"挂到旧 ref_id 上，DB 名字保留旧名，状态值却已被覆盖。

**修复**：
- 新增 `backend/memory/recall.js#renderNearbyCharacters(worldId, sessionId)`：读取 `session_nearby_characters` 全部行，按 `character_state_fields.nearby_enabled=1` 字段渲染每个角色为 `【name】\n记忆：<memory>\n- 字段：值` 文本块；空池或全字段无值时返回空串。
- `backend/prompts/assembler.js#buildWritingPrompt` 在 [6] 玩家状态后注入 `<nearby_characters>` 段，包含提示语「叙述中若涉及这些人物，必须沿用其既定名字，不要另起新名」。位置语义对应 chat 模式的 [7] 角色状态段。
- 同步修订 assembler.js 顶部的 dynamic layer 段位注释、ARCHITECTURE.md §4 写作模式表格 [7] 行。

**不区分**已保存 / 临时（用户决策：主模型只需要看到"这些名字已经被占用"），**包含** `memory`（一句话交互总结对叙事连贯有帮助）。

验证：（1）写作 session 出现第一个无名角色 → 状态更新生成名字 X →下一轮发送消息，查看 `data/logs/worldengine-*.log` 的 prompt 段（开启 `logging.prompt.enabled`），确认 `<nearby_characters>` 段含 X 名字；（2）下一轮 AI 生成正文应使用 X 而非新名字。`npm run test:backend` 0 fail。

## 2026-05-11 feat(session): 写作 session 与玩家卡强绑定，仅 active 玩家卡可进入写作

此前同一世界下所有 writing session 共享 `worlds.active_persona_id`，切换 active persona 会让原本写作 session 的"玩家身份"被覆盖；而前端 `currentPersonaId` 只控制顶栏头像显示，与后端拼提示词的 persona 不一致。改造：

- `sessions` 表新增 `persona_id TEXT FK→personas.id ON DELETE CASCADE NULLABLE`（writing 用，chat 维持 NULL），新增索引 `(world_id, persona_id, mode, updated_at)`。一次性迁移把现存 writing session 回填到当时世界的 active persona（active 为 NULL 时回退到最早创建的 persona）。
- `services/writing-sessions.createWritingSession` 创建时把 active persona 快照写入 `sessions.persona_id`；世界无 persona 时自动创建一张"玩家"兜底（避免 FK 失败）。`GET /api/worlds/:id/writing-sessions` 改为仅返回当前 active persona 名下的会话。
- `memory/recall.js#renderPersonaState` 与 `db/queries/session-state-values.js#getSessionPersonaStateValues` 都改为优先 `sessions.persona_id`，回退到 `worlds.active_persona_id` → 最早 persona。`memory/combined-state-updater.js` 读取 persona 默认值层时按 `session.persona_id` 取 `getAllPersonaStateValuesByPersonaId`，否则回退原 `getAllPersonaStateValues(worldId)`（chat）。
- `services/personas.deletePersonaService` 在 DB DELETE 之前先逐条调用 `deleteWritingSession`，让 cleanup 钩子（长期记忆/日记目录/附件等磁盘资源）正常触发。
- 前端：`store.currentPersonaId` 删除；`CharactersPage` PersonaCard 非 active 卡点击禁用（`aria-disabled` + 灰态 + `cursor:not-allowed`），active 卡点击仅清空 `currentWritingSessionId` 后跳 `/worlds/:wid/writing`；激活其他 persona 也清空 hint。`WritingSpacePage` 改为按 `currentSession.persona_id` 加载顶栏头像。

验证：（1）多 persona 世界激活 A → 写作页只显示 A 的 session；激活 B 后点 B 卡 → 切到 B 的 session 列表；（2）非 active 卡视觉禁用且无法点击进入；（3）删除 persona A 后 A 名下所有写作 session 消失，`data/long_term_memory/{sid}/` 等磁盘目录被清理；（4）chat 模式 persona 选择仍由 `worlds.active_persona_id` 决定，行为未变。`npm run check` 全绿。

## 2026-05-11 fix(assistant): 写卡助手人设正文统一改为第三人称

写卡助手此前对 persona 卡的知识约束明确写了“第一/第二人称落笔”，写作模式 nearby 制卡模板也把 `system_prompt` 输出要求写死成“第二人称写法”，导致助手生成的人设正文持续偏向“你是/你会/你身处……”式表述。现统一改为第三人称：

- `assistant/knowledge/USERCARD.md`：`system_prompt` 说明改为“统一用第三人称落笔”。
- `assistant/knowledge/CHARCARD.md`：补充角色卡 `system_prompt` 也统一用第三人称写角色人设，避免角色卡与 persona 卡风格分裂。
- `backend/prompts/templates/writing-nearby-card-analyze.md`：nearby 制卡草稿的 `system_prompt` 输出要求由“第二人称写法”改为“第三人称写法”。
- `backend/tests/services/nearby-card-maker.test.js`：测试 mock 与断言改为第三人称示例，避免继续固化旧风格。

验证：`npm run test:backend -- nearby-card-maker.test.js` 应通过；写卡助手新建/改写 persona 或 nearby 制卡时，生成的人设正文应表现为“某人如何、身处何处、具有什么经历”的第三人称叙述，而非“你如何”的第二人称。

## 2026-05-11 fix(assistant): 写卡助手 typing 省略号在一轮输出结束后"复活"

`AssistantPanel.jsx` 原 `pendingAssistant = isActiveTask && !hasRunningItem`,以 `status ∈ {planning, executing, paused}` 作为"还在跑"的判据。问题:一轮 SSE 结束时服务端发 `done:true`,store 清掉 last assistant 的 `streaming` 标志 → `hasRunningItem` 变 false;而 `status` 在父代理仍等用户下一句/审批时不会推到终态——`pendingAssistant` 因此从 false 反弹回 true,省略号气泡在"已经输出完"的 assistant 气泡之后又冒出来,看起来像永远转圈。改为 `pendingAssistant = isStreaming && !hasRunningItem`:`isStreaming` 是 fetch 真正在跑的本地标志,SSE reader 结束后立刻 false,无歧义。

验证:正常一轮对话,等输出完整结束 → assistant 气泡下方不再有 typing 省略号;期间仍能在"已发送、尚无 delta"窗口内看到省略号。

## 2026-05-11 fix(assistant): 写卡助手「停止」按钮无反馈

`assistant/client/AssistantPanel.jsx` 的 `handleStop` 仅 abort 本地 SSE 与 `setIsStreaming(false)`，未触达后端任务也未推进本地 store 状态机；status 仍卡在 `planning/executing`，`pendingAssistant=isActiveTask && !hasRunningItem` 维持为 true，输入气泡的 typing 省略号不消失，用户视觉上"完全没反馈"。修正：abort 后 ① `cancelTask(taskId)` 通知后端停任务（仅当已有 taskId）② 本地 `ingestEvent({ type: 'task_cancelled', taskId })` 注入终态事件——因 abort 后 SSE 不再回传 `task_cancelled`，必须本地注入才能把 status 推到 `cancelled`，让 `pendingAssistant` 变 false、省略号气泡消失，同时输入框走入终态占位文案"任务已结束，点击「清空」开始新任务"。

验证：打开写卡助手 → 发送任意消息 → 在出现省略号气泡时点击「停止」→ 省略号立即消失，输入框 placeholder 切到终态文案，点击「清空」可继续对话。

## 2026-05-11 refactor: 抽离写作"附近"角色制卡 prompt 到 backend/prompts

将 `backend/services/nearby-card-maker.js` 中 `analyzeNearbyForCard` 内联硬拼的 LLM 提示词搬到 `backend/prompts`，与现有 `nearby-prompt.js`（writing 模式 nearby pool 段）和模板体系对齐。

- 新增 `backend/prompts/templates/writing-nearby-card-analyze.md`：制卡 prompt 模板，含 `{{NAME}}` / `{{STATE_LINES}}` / `{{MEMORY}}` / `{{RECENT_ROUNDS}}` / `{{RECENT_TEXT}}` 变量。
- 新增 `backend/prompts/nearby-card-prompt.js`：导出 `buildNearbyCardAnalyzePrompt({ name, memory, stateValues, recentMessages, recentRounds })`，内部用 `renderBackendPrompt` 渲染模板，返回 `[{ role:'user', content }]`。
- `backend/services/nearby-card-maker.js`：删除内联 `stateLines / recentText / prompt` 三段，改为调用 `buildNearbyCardAnalyzePrompt`；其余行为（`llm.complete` 参数、`tryParseJson`、错误日志、返回结构）保持不变。
- 更新 `backend/prompts/README.md`：`代码文件` 段新增 `nearby-card-prompt.js`；模板清单"标题生成"分类下追加 `writing-nearby-card-analyze.md` 条目。

验证：`node -e "..."` 实际调用新 builder 渲染输出，与原硬编码字符串逐行一致（`## 该角色的状态字段` / `## 输出要求` 等段落与变量替换全部正确）。无 schema/接口/数据库变更。

## 2026-05-11 docs: 修订 README / ARCHITECTURE / backend prompts README / frontend README 的过时信息

四处事实漂移修正，均不动代码与 schema：

- `README.md:100` 与 `ARCHITECTURE.md:32` 的"React 18"改为"React 19"，与 `frontend/package.json`（`react ^19.2.4`）和 `CLAUDE.md:53` 对齐。`docs/CHANGELOG-archive.md` 内的 React 18 提及为历史决策记录，保留不动。
- `frontend/README.md` 原为 Vite 默认模板（"React + Vite"+ESLint 引导），与项目无关。重写为 WorldEngine 前端的入口说明：技术栈一句话、本目录命令清单（dev/build/preview/lint/test/test:watch）、指向根 `README.md` / `CLAUDE.md` / `DESIGN.md` / `ARCHITECTURE.md`。
- `backend/prompts/README.md` 模板清单与 `templates/` 实际内容显著漂移：删除已不存在的 `writing-impersonate.md`；按"Prompt 条目命中 / 记忆与摘要 / 标题生成 / 状态更新与压缩 / 用户操作辅助 / 其他"6 个分类重列全部 18 个模板，每条注明用途与调用方（逐个 grep 验证，未凭印象）；代码文件段补入 `nearby-prompt.js`（写作模式 nearby pool 段构建）；订正 `chat-impersonate.md` 调用方（聊天与写作均使用，原 README 仅写聊天路由）。

验证：`grep -n "React 18" README.md ARCHITECTURE.md CLAUDE.md` 无输出；`ls backend/prompts/templates/` 与 README 列表 diff 仅差 README.md 自身；`ls backend/prompts/*.js` 4 个文件全部出现在 README "代码文件"段。

## 2026-05-10 fix(ui): 状态字段标签与世界/玩家/附近/角色名字号上调

`index.css`：`.we-section-label` 9.5px → 11.5px（世界/玩家名/附近/TIMELINE 区块标题，及附近角色名）；`.we-status-key` 9px → 11px（状态字段标签，如 储物/队友/属性点 等）；`.we-status-table-head-cell` 9px → 11px（table 类型字段的列名）；`.we-state-section-reset` 9.5px → 11.5px（hover 时显现的「保存/取消/移除/+角色卡/制卡/重置」等区块操作按钮）。原字号在常见显示密度下偏小，识别困难。同时 `NearbyCharacterBlock.jsx` 角色块 chevron `size` 16 → 12，使「附近」与其下角色形成明显层级差。

## 2026-05-10 feat(ui): 附近角色块未保存态新增「移除」按钮，已保存态「移除」改为「取消」

`NearbyCharacterBlock.jsx` 原本在标题行根据 `is_saved` 互斥渲染单个按钮（未保存只有「保存」、已保存只有「移除」），用户在未保存态没有"丢弃这个新登场角色"的入口。改为：
- **未保存**：并列 `[保存][移除]`。`保存` 调 `setNearbySaved(true)`；`移除` 调 `removeNearby` 物理删除（DELETE 行 + state CASCADE 同步删），下轮提示词不再注入。
- **已保存**：单个 `[取消]`，调 `setNearbySaved(false)` 仅把 `is_saved` 翻回 0；DB 记录保留，前端列表仍显示，下轮提示词组装仍注入该角色。

⚠️ 关键语义：「移除」≠「取消」。移除是物理删除（彻底丢弃），取消只是取消保存（保留临时记录）。两个按钮各调一个已存在的接口，后端零改动。仅前端 `NearbyCharacterBlock.jsx` 一个文件。

## 2026-05-10 fix(ui): 附近角色「已保存」标识改为名字加粗强调色

`NearbyCharacterBlock.jsx` 原来在角色名前渲染一个朱红小圆点（`we-nearby-seal`）表示已保存，与书卷风视觉风格不搭。改为给 `we-section-label` 增加 `--saved` 修饰类，已保存时名字本身变 `--we-color-accent` + `font-weight:600`。同步删除 `index.css` 内 `.we-nearby-seal` 旧规则。

## 2026-05-10 fix(prompt): 写作模式 nearby 新登场角色名禁止描述短语，必须真名

`prompts/nearby-prompt.js` 的「新登场角色」段原先只对 state 字段做严格约束，对 `name` 没要求，导致 LLM 经常把"短发女猎人""黑衣男人""神秘女子"等职业/外貌描述短语当 name 写进 nearby pool。补一条 name 规则：必须是专有人名（真名/化名/昵称均可）；正文未给名时按身份/性别/世界观虚构一个真名；显式列举 5 类禁用例。仅写作模式生效（chat 模式不走 nearby pool）。验证：新开写作 session，正文只描述未具名角色后触发自动状态更新，附近面板新增的角色应显示具体人名而非描述短语。

## 2026-05-10 fix(ui): 附近面板「记忆」分段标签去掉右侧分隔线

`NearbyCharacterBlock.jsx` 内嵌的「记忆」分段沿用 `we-state-section-title` 结构带 `we-section-rule`（横向分隔线），与上方「附近 / 角色名」一行已有的横线视觉重复。仅这一处去掉 rule，其它分段（外貌等）保留。

## 2026-05-10 feat(ui): 顶部栏新增「会话」入口，跨 mode 跳到最近会话

`TopBar.jsx` 在「故事」左侧新增一项「会话」按钮：点击调用新增的 `GET /api/worlds/:worldId/latest-session`，按 `updated_at` 取该世界最近一条会话（chat 或 writing 都看），mode='writing' → `/worlds/:worldId/writing`，mode='chat' → 先把 `currentCharacterId/currentSessionId` 写入 store 再跳 `/characters/:characterId/chat`，与 ChatPage 的 store 驱动会话加载逻辑（`ChatPage.jsx:264`）对齐。无会话时 info 日志、不跳转。Active 高亮在 chat 或 writing 路径下生效。后端：`db/queries/sessions.js` 新增 `getLatestSessionByWorldId`（chat 走 `characters.world_id`，writing 走 `sessions.world_id`，LEFT JOIN + OR）；`services/sessions.js` 转出；`routes/sessions.js` 新增路由。

writing 模式特殊处理：用户已在 `/worlds/:wid/writing` 时，单纯 `navigate(同 URL)` 是 no-op，会停留在旧的 active session（`WritingSpacePage` 把当前 session 存在组件本地 state，只在 worldId effect 首次 list 时挑 sessions[0]）——Codex review 指出。修复：`store/index.js` 新增 `currentWritingSessionId`（命中即消费），TopBar writing 分支 `setCurrentWritingSessionId(session.id)` 后再 navigate；`WritingSpacePage` 在 init 阶段优先按 hint 命中、post-mount 再加一段 effect 监听 hint 变化，按 id `getSession` 后 `enterSession` 并清空 hint。`store/index.js` 是锁定文件，本次因新增字段必要性明确而修改。

## 2026-05-10 fix(ui): 状态字段「登场角色启用」勾选框换为陶土红主题色

`StateFieldEditor.jsx` 中该 checkbox 沿用浏览器默认蓝色 accent，与书卷风羊皮纸/陶土红主题不符。加上 `accent-[var(--we-color-accent-deep)]` 让填充色与主题强调色一致。仅样式微调。

## 2026-05-10 fix(llm): 副模型/写作模型 thinking_level 用户配置被 hardcode 覆盖

副模型设置里选 `thinking.type=disabled`（deepseek v3.1+ 关思考）后，状态栏/摘要/日记/标题等任务仍出现 `<think>…</think>`。根因不在 UI，而在所有副模型/写作模型 scope 的 `llm.complete` 调用都硬编码了 `thinking_level: null`：`backend/llm/index.js:115` 用 `hasOwnProperty` 区分"显式 null"与"未传"，调用方传了 null 就强制覆盖副模型配置；而 `_utils.js:179` 对 deepseek/glm 来说 `null` ≠ `'thinking_disabled'`，前者是"完全不下发 thinking 字段、走模型默认"，所以 deepseek-v4-flash 默认开思考——用户的设置永远没机会落到请求体上。

修复：移除 `combined-state-updater.js`(state_update + state_compress)、`turn-summarizer.js`、`summary-expander.js`、`diary-generator.js`、`entry-matcher.js`、`nearby-card-maker.js`、`long-term-memory.js`、`routes/writing.js`(writing_impersonate) 共 8 处 aux/writing 调用的 `thinking_level: null` 硬编码，让用户在副模型/写作模型 UI 设置的 thinking_level 通过 `buildLLMConfig` 自然透传。`routes/chat.js` 的 impersonate / retitle 走主模型 scope，不在本次修改范围。同时保留前一条 `stripThinkBlocks` 解析容错作为 defense-in-depth（万一服务端故障重开思考、或用户故意把副模型 thinking 开成 enabled，仍能解析 JSON）。验证：429 后端单测全过；真实回归看 deepseek 副模型请求体应包含 `"thinking":{"type":"disabled"}` 而非缺失字段。

## 2026-05-10 fix(state): 状态更新 JSON 解析被 reasoning 模型 `<think>` 块污染

`combined-state-updater.js` 与 `nearby-card-maker.js` 用贪婪正则 `/\{[\s\S]*\}/` 从 LLM 输出抓 JSON。deepseek 思考型模型（如 `deepseek-v4-flash`）即使设置 `thinking_level: null`（该开关只对 Anthropic 生效）仍会输出 `<think>…</think>`，思考块里包含大量讨论性的 `{}` 片段，会让正则把"think 内首个 `{` → 真 JSON 末尾 `}`"全段抓走，拼成非法字符串导致 `JSON PARSE FAIL`，整轮状态/nearby 草稿静默不写入。修复：解析前先 `replace(/<think>[\s\S]*?<\/think>/gi, '')` 再剥未闭合的 `<think>...$`，三处提取点（`updateAllStates`、`compressOverLimitFields`、`tryParseJson`）统一处理。session `6139b9ee` 的三轮 `JSON PARSE FAIL` 由此触发；问题对所有 reasoning 系列的 aux 模型通用。验证：跑 `tests/memory/combined-state-updater*.test.js` + `tests/services/nearby-card-maker.test.js` 共 14 测全过；后续真实对话观察 `[all-state] JSON PARSE FAIL` 警告应消失。

## 2026-05-10 fix(state): table 类型状态值保存因二次解析 table_columns 报"不符合类型约束"

`backend/db/queries/_state-fields-base.js` 的 `parseRow` 已经把 `table_columns` 从 JSON 字符串解析为数组；但 `backend/services/state-values.js` 的 `validateStateValue` 在 `case 'table'` 仍然 `JSON.parse(field.table_columns)`，对数组再次解析必然抛错被 catch → `columns=[]` → 直接返回 undefined → 报"字段 X 的值不符合类型约束"。修复：在校验里兼容数组/字符串两种形态（仅当为字符串才 `JSON.parse`）。影响所有 `type='table'` 的世界/角色/玩家状态字段保存路径。验证：PATCH /api/worlds/:wid/personas/:pid/state-values/attributes_user 返回 `{success:true}`，前端 toast 不再触发。

## 2026-05-10 fix(ui): ToastCard 修复无效 CSS 变量导致 toast 透明/黑字不可读

`ToastCard.jsx` 引用了仓库中不存在的 token：`--we-color-surface-paper`、`--we-color-ink-primary/secondary/tertiary`，导致背景透明、文字回退到默认黑，叠在深色 TopBar 上几乎不可见。改为已定义的 `--we-color-bg-canvas` 与 `--we-color-text-primary/secondary/tertiary`。验证：dispatch `we:toast` error 后 bg=`rgb(237,227,208)`、msg color=`rgb(83,66,54)`。

## 2026-05-10 fix(state): table 类型默认值编辑器改为表格布局

`StateValueField` 中 `type=table` 的默认值原渲染为 `flex flex-wrap` + 每列「label + 数值输入」的横向小卡片，列多时会换行散开（参见角色页"属性"行的 力量/敏捷/体力/精神/战斗力）。改为复用 `we-status-table`（表头行 + 输入行）结构，与右侧状态栏 `StatusTable` 视觉一致；保留原 setLocal/saveValue/min/max 行为。

## 2026-05-10 feat: 日志补齐与通知体系总览（24 任务）

按 `docs/superpowers/plans/2026-05-10-logging-overhaul.md` 完成日志体系重构。本条是阶段性 ROLLUP，下方各小条记录单独 commit。

**后端 logger 加固**
- `formatMeta` 强制字段顺序（requestId/sessionId/characterId/worldId/module）+ null 跳过 + 字符串截断
- `requestId` AsyncLocalStorage 透传，每行日志自动带 `rid=xxxx`，response header 加 `x-request-id`
- 启动横幅打印 LOG_LEVEL/mode/dataDir
- db 层包装 prepare → 慢查询 (>=200ms) warn + SQL 异常 error
- routes/services/llm/memory/queue/cleanup/assistant 全量分级日志补齐
- 新增 `getClientLogger()` 子 logger，tag `client`

**后端 client-logs 接收**
- 新增 `POST /api/client-logs`：256KB body cap (413) / batch ≤100 (截断) / IP rate ≤10/s (429) / 数组校验 (400)
- 同一日志文件 + `[client]` tag

**前端 logger（新增）**
- `utils/logger.js` 4 级 API + 3 通道（toast / console / 上报后端）
- 缓冲：20 条 / 5s / 含 error 触发 flush；sendBeacon 卸载兜底；localStorage 重试队列（FIFO 200）
- 50+ `pushErrorToast` 调用全量迁移为 `log.error(event, err, { toast })`，event 命名 `<域>.<动作>.<结果>`
- ESLint 自定义规则 `no-direct-toast-import` 守门组件直接 import

**通知 UI 重写**
- 印章/签封风 `ToastCard`（羊皮纸底 + 4px 左色条 + SVG icon + 半透印章水印 驳/警/录/成）
- 右上角堆叠（`top-4 right-4`），移动端贴边，MAX_TOASTS=3
- 入场 spring 弹跳 + 出场右滑 fade，hover 暂停消失计时 + 关闭键 ✖
- 时长分级：error/warn 5s, info/success 3s

**ESLint 规则**：`eslint-rules/no-direct-toast-import.js`（已接前端 lint）、`eslint-rules/no-backend-console.js`（待 backend 引入 lint pipeline 启用）

**测试**：`backend npm test` 429 pass；`frontend npm test` 151 pass。

## 2026-05-10 feat(logger): services 关键状态变更 info + 异常 error

Task 18：对 `backend/services/*.js` 21 个文件补齐域级日志，统一 tag `svc`（color `green`），格式 `<域>.<动作>`：

- 状态变更 info：`world.create/update/delete`、`character.create/update/delete`、`session.create/delete`、`writing_session.create/delete`、`persona.create/update/delete/activate`、`message.delete/delete_after/delete_all/edit_and_truncate`、`writing_message.delete_after/delete_all`、`{world,character,persona}_state_field.create/update_default/delete`、`prompt_entry.create/update/delete`、`regex_rule.create/update/delete`、`css_snippet.create/update/delete`、`config.update`、`config.update_provider_key`、`character.import`、`world.import`、`global_settings.import`、`nearby.add_from_character/remove`、`nearby_card.create_character`。
- error：`nearby_card.analyze.failed`（LLM 返回非法 JSON 时记录后再抛）。其余服务的 throw 都是参数校验/资源不存在，由路由层 Task 17 的 500 兜底捕获，避免重复日志。
- 跳过：`_state-field-helpers.js`（helper）、`cleanup-registrations.js`（Task 21 接管）、`client-log-ingest.js`（Task 5 自身就是日志消费者）、`import-export-validation.js`（纯校验，无副作用）、`state-values.js`（字段级 upsert 属内部步骤，不算公共 API 完成点）、`long-term-memory.js`（已有 `ltm` 自有 logger）、`chat.js`（`processStreamOutput` 每轮触发，日志归属 routes/SSE 层）。
- `worlds.createWorld` 会经 `ensureDiaryTimeField` 触发 `world_state_field.create` 等子日志，每个仍独立成行，符合"每个状态变更记一条"的原则。

**验证**：`cd backend && npm test` → 429 pass / 0 fail / 3 skipped。

## 2026-05-10 feat(logger): routes 全量补齐 warn(校验失败/404) + error(500)

Task 17：对 `backend/routes/*.js` 19 个文件（不含已完成的 `client-logs.js` 与无路由的 `stream-helpers.js`）补齐域级日志：

- 每个 `res.status(400)` 之前加 `log.warn('<file>.bad_request ...')`，附 `method/path/reason` 元数据。
- 每个直接 `res.status(404)`（非 assertExists 路径）加 `log.warn('<file>.not_found ...')`，附 `id`。
- 每个 try/catch 兜底 500 加 `log.error('<file>.unhandled ...')`，附 `msg`。
- 集中改造 `backend/utils/route-helpers.js` 的 `assertExists`：内部 log.warn `routes.not_found`（带 method/originalUrl/reason），所有 assertExists 调用点自动覆盖。
- 缺 logger 的文件统一引入 `import { createLogger, formatMeta } from '../utils/logger.js'` + `const log = createLogger('<routeName>', 'cyan')`。

未触碰 `client-logs.js`（已自管 400/413/429）、`stream-helpers.js`（无路由）、`session-timeline.js`（仅 assertExists 已覆盖）。`backend/llm/providers/gemini.js` 不在本任务范围。

**验证**：`cd backend && npm test` → 429 pass / 0 fail / 3 skipped。`npm run lint` 后端无新增错误（前端 ToastCard 已存在的 warning 与本任务无关）。

## 2026-05-10 fix(provider): Anthropic adapter 拆 cache_control prefix + 修 Gemini 思考块缺失

**Issue 1 — Gemini 思考块"被自动隐藏"**

根因：`backend/llm/providers/gemini.js` 中 `streamGemini` / `completeGemini` 两处构造 `thinkingConfig` 时只传了 `thinkingBudget`，未传 `includeThoughts`。Gemini API 该字段默认 `false`，模型仍消耗 thinking budget 但响应 parts 不下发 `thought: true` 块 → `streamGemini` 走不到 `<think>` 分支 → 前端 `parseStreamingBlocks` 拿不到可解析的标签。这是与 Anthropic（`thinking.type=enabled` 即返回完整 thinking block）的真实机制差异。

改动：[backend/llm/providers/gemini.js:102](backend/llm/providers/gemini.js:102) 与 [:168](backend/llm/providers/gemini.js:168) 两处 `thinkingConfig = { thinkingBudget }` 改为 `{ thinkingBudget, includeThoughts: true }`。`completeGeminiFromNative`（line 210，工具/记忆路径）不动 — 输出不展示给用户，加 think 块只会污染中间轮次 nativeContents。

注意：Gemini 返回的是 thought summary 而非完整推理链，长度通常远短于 Anthropic 的 thinking 块，这是 API 限制无法对齐。

**Issue 2 — kimi-coding 缓存命中率低**

通过临时 SSE 响应埋点抓到 kimi-coding 的 `message_delta.usage` 真实包含 `cache_read_input_tokens=3072 / cached_tokens=3072`（Moonshot 同时返回 Anthropic 字段和 OpenAI 字段），代码解析逻辑无 bug，命中数据能正确入账。但前几轮 cache_read 恒为 0 的根因找到一个真实可改进点：

[anthropic.js:7-10](backend/llm/providers/anthropic.js:7) 的 `withCacheControl` 把 `cache_control: ephemeral` 打在**整段 system** 上。但 assembler 输出的 system 是 `[1-3.5 稳定段]+[4-10 动态段]` 合并体，每轮内容会变（时间、状态字段、附近角色），整段 hash 不稳定 → 缓存边界跟着失效。这与 [openai-compatible.js:28](backend/llm/providers/openai-compatible.js:28) `normalizeOpenAICompatibleMessages` 已做的"拆稳定前缀 + 动态后缀"优化是一致的，但 anthropic 路径漏了。

改动：[anthropic.js:6-24](backend/llm/providers/anthropic.js:6) `withCacheControl` 接收 `config` 参数，若 `config.cacheableSystem` 提供了稳定前缀且 system 以其开头，则把 system 拆成两段——`{ type:'text', text:cacheable, cache_control:ephemeral }` + `{ type:'text', text:dynamic }`，cache_control 只标在 prefix 上。四处 caller 同步传入 config（streamAnthropic / completeAnthropic / completeAnthropicWithTools / resolveToolContextAnthropic）。影响范围：anthropic / kimi-coding / minimax-coding 三家命中稳定性。

**验证**：`npm run test:backend` 414/414 pass。端到端：
- Gemini：前端选 Gemini 模型 + 任意 thinking 档位发消息，预期消息上方出现可折叠"思考过程"块。
- kimi-coding：连续两轮使用同一 session（system 稳定前缀不变），第二轮起 token 用量面板看到 `cache_read_tokens > 0`。



**症状**：用户反馈 Gemini 模型的思考块在 UI 上"被自动隐藏"。

**根因**：`backend/llm/providers/gemini.js` 中 `streamGemini` / `completeGemini` 两处构造 `thinkingConfig` 时只传了 `thinkingBudget`，未传 `includeThoughts`。Gemini API 该字段默认为 `false`，模型仍消耗 thinking budget 但响应 parts 不下发 `thought: true` 块 → `streamGemini` 走不到 `<think>` 分支 → 前端 `parseStreamingBlocks` 拿不到可解析的标签 → 用户感知为思考块"被隐藏"。这是与 Anthropic（`thinking.type=enabled` 即返回完整 thinking block）的真实机制差异。

**改动**：[backend/llm/providers/gemini.js:102](backend/llm/providers/gemini.js:102) 与 [:168](backend/llm/providers/gemini.js:168) 两处 `thinkingConfig = { thinkingBudget }` 改为 `{ thinkingBudget, includeThoughts: true }`。`completeGeminiFromNative`（line 210，工具/记忆路径）不动 — 该路径输出不展示给用户，加 think 块只会污染 nativeContents 中间轮次。

**验证**：`npm run test:backend` 414/414 pass。端到端验证需在前端选 Gemini 模型 + 任意 thinking 档位发消息，预期消息上方出现可折叠"思考过程"块。注意：Gemini 返回的是 thought summary 而非完整推理链，长度通常远短于 Anthropic 的 thinking 块，这是 API 限制。

**未解决**：用户同时反馈 kimi-coding 缓存命中恒为 0，待用户提供 raw 日志（`message_start` / `message_delta` 的 usage 原文）后再定位字段名 / beta 头 / 断点哪类问题。

## 2026-05-10 ui+prompt: nearby 记忆段视觉与状态字段统一；prompt 重构去冗余 + 修示例 bug

**视觉**：附近面板里"记忆"段之前用独立小字+左侧粗 border 风格（we-nearby-memory: text-sm + ink-faded + border-left），与下方状态字段（StatusSection）的 label+body 双层结构不一致，看起来像引文块、字号偏小、颜色偏淡。改：
- `NearbyCharacterBlock.jsx`：在记忆文本前加 `<div class="we-state-section-title"><span class="we-section-label">记忆</span><span class="we-section-rule"/></div>`，与下方各字段标题同构（小字间距大写 label + 横线）
- `index.css/.we-nearby-memory`：font-size 从 `--we-text-sm` 升到 `--we-text-base`（16.5px），color 从 `--we-color-text-tertiary` 改为 `--we-ink`，去掉左侧 border 与多余 padding，line-height 微调；记忆正文与下方字段值的字号、字重、颜色完全一致

**prompt**：上次给 nearby-prompt 加了「关键约束块 + few-shot example」，但发现两个问题：① few-shot 硬编码示例值"专注/柜台后方/正在核对今日账目"塞前 3 个字段，不感知字段 type — 若第 3 字段是 number/enum 会把字符串塞进去，反而误导 LLM；② 任务说明 1-5 项与约束块多处重复（"新登场必填""稀疏 patch""字段 type 约束"各讲两遍）；③ 结构散乱（池→字段→约束→示例→任务列表，读者要回看）。重写：
- 用 `## 标题` 划分四段：附近角色池 / 启用字段 / 输出 / 新登场规则 / 稀疏 patch 规则 / 示例
- 示例改为不绑定具体值的占位符示例（`{a: <a的合规值>, b: ..., c: ...}`），只示范 key 集合而非误导值
- 砍重复：原"任务"列表 1-5 合并入"输出"段
- 字符数 1550 → 1219（-21%），行数 36 → 30，结构清晰且语义不丢

**验证**：`combined-state-updater-nearby.test.js` 6/6 pass；`frontend npm run lint && npm run test` 139/139 pass。

## 2026-05-10 fix(prompt): nearby fieldsDesc 补齐 enum/number/list/datetime/table/boolean 完整约束

**背景**：3e6197f 强化新登场必填后，仍发现枚举类字段普遍空缺。根因：`backend/prompts/nearby-prompt.js` 的 `fieldsDesc` 只输出 `key（label，类型：xxx）+ description`，**没有把 enum 的可选值、number 的 range/unit、list/datetime/table/boolean 的格式说明**告诉 LLM。LLM 不知道枚举值集合 → 要么乱写 → apply 层 `validateValue` 判定非法 → 字段被丢弃 → 看起来"空了"。

**改动**：`backend/prompts/nearby-prompt.js` 的 `fieldsDesc` 补齐与主 state updater (`combined-state-updater.js`/`buildFieldsDesc`) 同等详细的字段约束渲染：
- enum：列出 `可选值（必须从中选一个）：[opt1 / opt2]`
- number：`范围：lo ~ hi` + `单位：xxx`
- list：要求字符串数组格式
- datetime：要求 ISO 局部时间字符串格式
- table：列出列定义 `{key(label, lo~hi)}`
- boolean：要求 true/false
- update_instruction：单独换行附在字段后

**验证**：`combined-state-updater-nearby.test.js` 6/6 pass。

## 2026-05-10 fix(state): table 类型默认值在角色/玩家编辑页可编辑且通过校验

**背景**：`type='table'` 状态字段在「编辑角色 / 编辑玩家(persona)」页的默认值输入框显示 `[object Object]`，保存时后端报 `字段 X 的值不符合类型约束`。三个根因合一：① 前端 `StateValueField.jsx` 未给 table 类型加渲染分支，对象被 `String()` 转成字面量；② 后端 `validateStateValue()` switch 缺 `case 'table'`，落到 `default` 返回 `undefined` 触发抛错；③ `getCharacterStateValuesWithFields` / `getPersonaStateValuesWithFields(ByPersonaId)` / `getWorldStateValuesWithFields` 三个 SELECT 漏取 `table_columns`，前端拿不到列定义。

**改动**：
- `backend/services/state-values.js`：`validateStateValue()` 新增 `case 'table'`，按 `field.table_columns` 解析列定义，逐列校验数值并应用 min/max；空值列跳过（稀疏），全空时按 `allow_empty` 判定。
- `backend/db/queries/{character,persona,world}-state-values.js`：三处 with-fields SELECT 补 `table_columns` 字段。
- `frontend/src/components/state/StateValueField.jsx`：新增 `field.type === 'table'` 渲染分支，按列展开数字输入框；onBlur 时以 `{colKey: number}` 形式 saveValue，与 `StateFieldEditor` 默认值序列化口径一致。

**约束**：列校验和 StateFieldEditor 列默认值序列化（`StateFieldEditor.jsx:157-165`）三方对齐，统一只接受数字、跳过空列。

**验证**：`npm run lint` 通过；`npm run test:backend` 414/414 pass。

**补丁**：`backend/db/queries/world-state-values.js` 的 `getWorldStateValuesWithFields` SELECT 同步补 `wsf.enum_options`（历史遗漏，与 character/persona 三方对齐），便于世界级 enum 字段在编辑页正确渲染选项。

## 2026-05-10 fix(prompt): nearby 新登场必填强化 — 关键约束块前置 + few-shot example + 缺字段 warn 日志

**背景**：上一轮（f6e92cf）把"新登场必填"加进 prompt 后，LLM 仍倾向只写正文显式提到的字段，新 transient 大量字段空缺。原因：规则放在任务说明第 6 条，注意力权重不够；缺少具体示例；缺少诊断手段。

**改动**：
- `backend/prompts/nearby-prompt.js`：把"新登场必填"提到任务说明前作为「关键约束 ‖ 新登场角色 state 字段必须 100% 填齐」块（带加重符号），并显式列出所有启用字段 key 的并集，要求 state 对象 key 严格等于该集合；增加三档值决定优先级（正文事实 → 暗示推理 → 合理性创作）；禁止占位符列表扩充至 "未知/待定/暂无/不详/无/N/A"；附 few-shot 示例（✓ 全填齐 / ✗ 缺字段）。空池与有池分支共享同一约束文本。
- `backend/memory/combined-state-updater.js`：`applyNearbyResult` 新建 transient 时检测 LLM 返回的 state key 集合，缺字段时写 `NEARBY NEW MISSING FIELDS` warn 日志（含 session、name、missing 字段名），便于诊断 LLM 是否仍未遵守约束。

**约束**：服务端不做 fallback 创作（避免幻觉污染事实），约束完全靠 prompt 表达 + LLM 自觉；warn 日志仅供诊断。

**验证**：`tests/memory/combined-state-updater-nearby.test.js` 6/6 pass（apply 层只加日志，行为不变）。

## 2026-05-10 fix(prompt): nearby state 更新规则——新登场/空字段必须创作补全，已有字段稀疏 patch

**背景**：Task 6 的 nearby prompt 没明确"新登场角色 state 必须填齐"，LLM 倾向只写正文显式提到的字段，导致新 transient 仅 1-2 个字段有值，其余永远为空，附近面板看起来"信息残缺"。

**改动**：`backend/prompts/nearby-prompt.js`：在任务说明中追加 state 写入规则三分支 — (a) 新登场角色必须填齐所有启用字段，正文未提及的依据姓名/记忆/上下文推理性创作合理值，禁止占位符；(b) 池中已有角色仅输出变更字段（稀疏 patch）；(c) 池中已有但某字段当前为空 —— 本轮必须补全。空池分支同步加新登场必填提示。

**约束**：服务端不做 fallback 创作，避免幻觉与事实污染；约束完全靠 prompt 表达 + LLM 自觉。

**验证**：`tests/memory/combined-state-updater-nearby.test.js` 6/6 pass（apply 层未变，行为兼容）。


**背景**：Task 13 把 `nearby_enabled` 字段从 DB 打通到前端编辑器，但写卡助手（assistant 子代理）的知识层、normalize-proposal 校验层尚未感知该字段，LLM 输出 `nearby_enabled` 会被静默丢弃。同时 Task 12 报告了 assistant 端 `/extract-characters` `/confirm-characters` 路由仍在但前端已无调用方，需要本任务统一清理。

**改动 — 同步 nearby_enabled**：
- `assistant/server/normalize-proposal.js`：`STATE_FIELD_KEYS` 追加 `nearby_enabled`（apply 时 `pickAllowed` 自动透传）；create/update 两条归一化路径分别加 explicit 处理 — `target='character'` 时归一为 0/1，其它 target 出现该键直接抛 `nearby_enabled 仅 target='character' 时允许使用`；缺省时不补默认值，留 DB 默认 1
- `assistant/knowledge/WORLDCARD.md`：在"prefix（仅 datetime）"之后新增"nearby_enabled（仅 `target:"character"`）"小节，说明语义、用例（HP/MP/复杂数值表只对正式角色有意义时设 false）、target 限制与"不要主动补 1"规则
- `assistant/knowledge/CHARCARD.md`：在 `stateValueOps 规则` 段添加一句备注 — 字段定义上的 `nearby_enabled` 由 world-card 管理，character-card 不感知不应输出
- `assistant/tests/normalize-proposal-extra.test.js`：新增 1 个用例覆盖 6 个分支（character + 0/true/缺省 / world 拒绝 / persona 拒绝 / update + character 切换 / update + world 拒绝）

**改动 — 清理 legacy 路由**（Task 12 残留）：
- `assistant/server/routes.js`：删除 `POST /api/assistant/extract-characters`（含其使用的 `parseCharacterArray` 内联函数、`buildPromptMessages` 加载器、`SSE` 工具 `openSSE` / `sendSSE` / `endSSE`）与 `POST /api/assistant/confirm-characters`；同步删除 9 个仅供这两个路由使用的 import：`readFileSync` / `path` / `fileURLToPath` / `getCharactersByWorldId` / `createCharacter` / `getConfig` / `getWorldPromptEntryById` / `listWorldPromptEntries` / `listCharacterStateFields` / `getMessagesBySessionId` / `getMessageById` / `getWritingSessionById` / `dbDeleteCharacter` / `upsertCharacterStateValue` / `llm`；同时清理无引用的 `proposalStore` Map + `PROPOSAL_TTL_MS` + 其 GC `setInterval`（曾标注"保留供测试用"，全仓零引用）；header 注释更新为只列 `/agent*` 端点；`__testables` 不再导出 `proposalStore`
- `assistant/prompts/extract-characters.md`：整文件删除（仅供已删路由使用）
- `assistant/tests/routes-http.test.js`：删除 4 个 `/extract-characters` `/confirm-characters` 用例（参数校验 + 走完一轮 ×2）；删除仅供这些用例使用的 `insertWritingSession` 本地 helper 与 `insertWorld` / `insertMessage` import；保留 `sandbox` 与 `postSSE`（仍被 `/agent` 用例使用）
- `ARCHITECTURE.md` §4.x 写作助手模型切换：移除 `routes.js（extract-characters）` 括号注释，只列 parent-agent / sub-agent

**未改动**：
- `assistant/server/tools/apply-world-card.js`：tool schema 中 `stateFieldOps: { type: 'array' }` 已是 open 数组，不限制内层字段；`apply_world_card` 透传到 `normalizeProposal`，nearby_enabled 走新加的归一化分支即可，无需改 tool definition
- `assistant/server/tools/apply-character-card.js`：character-card 提案不携带 stateFieldOps（白名单 `STATE_TARGETS_BY_PROPOSAL_TYPE['character-card']` 为空集，已在 normalize 处拒绝），nearby_enabled 不可能从 character-card 路径进入，无需改动
- `assistant/knowledge/CONTRACT.md`：契约表格只列 proposal 顶层结构，不展开字段细节，无需改动

**验证**：`assistant npm test` 全绿（含新加 nearby_enabled 用例）；`backend npm run test` 全绿；`frontend npm run test` 全绿；`npm run lint` 全绿。

**残留**：无。

## 2026-05-10 feat(state): character_state_fields 增加 nearby_enabled 编辑入口（Nearby Task 13）

**背景**：Task 1 在 `character_state_fields` 上加了 `nearby_enabled INTEGER NOT NULL DEFAULT 1` 列，但 CRUD 链路一直忽略它，UI 也没有控制入口。本任务把它从 DB → service → route → frontend API → 编辑器 UI 打通。

**改动**：
- `backend/db/queries/character-state-fields.js`：INSERT 列表追加 `nearby_enabled`（默认 1，显式传 0 / false 才落 0）；UPDATE allowed 列表追加 `nearby_enabled`，写入时归一为 0/1
- `backend/tests/db/queries/state-fields.test.js`：新增 2 个用例 — character 默认/显式/update 切换可读回；persona/world 字段对象上不应出现 `nearby_enabled` 键
- `frontend/src/components/state/StateFieldEditor.jsx`：新增 `scope` prop（StateFieldList 早就传了，编辑器之前没用）；form 初值从 `field.nearby_enabled` 读取，缺省 1；仅 `scope === 'character'` 时在"更新方式"下方渲染复选框，并把 `nearby_enabled` 加进 onSave payload；world / persona 编辑面板完全不显示该项

**未改动（已自然透传）**：
- `backend/services/character-state-fields.js`：直接转发 `data` / `patch`，无白名单
- `backend/routes/state-fields.js`：`req.body` 整体透传到 service
- `frontend/src/api/character-state-fields.js` + `state-fields-factory.js`：data / patch 整体作为 body 发送

**验证**：`backend npm run test` 414/417 pass（3 skip 与本任务无关）；`frontend npm run lint` 0 错；`frontend npm run test` 139/139 pass。

**残留**：该字段是否真的在 nearby 面板/状态更新中起作用由后续任务读取该列实现。

## 2026-05-10 feat(ui): 制卡 modal 重写 — 候选改为本轮登场角色（Nearby Task 12）

**背景**：Nearby Characters Task 12 — 把 stub 状态的 `MakeCardModal` 实装为基于 `nearby` 池的两步制卡流程；同时清理 Task 11 残留的 legacy "提取角色" UI 链路（前端按钮已无对应后端可用入口，属死代码）。

**改动**：
- `frontend/src/components/book/MakeCardModal.jsx`：实装 pick → preview 两步骤；pick 列出本轮 nearby（含已保存标记），点击触发 `analyzeNearbyForCard`；preview 四字段（name / description / system_prompt / first_message）可编辑，确认调用 `createCharacterFromNearby`；包含 loading（按钮 disabled + 文案）/ empty（"本轮无登场角色"）/ error（pushErrorToast，409 提示同名占用）三态；视觉沿用 `we-cast-add-modal-*`，新增 `we-make-card-modal-*` 字段块（无 hex/rgba，全部走 `--we-*` token）
- `frontend/src/index.css`：在 `we-cast-add-modal-close` 之后新增 `we-make-card-modal-preview/field/label/input/textarea/footer` 样式块
- `frontend/src/styles/ui.css`：删除 `we-character-preview-*`（98 行）与 `we-character-analyzing-*`（28 行）样式块；保留 `@keyframes we-spin`（其它消费者仍在用，定义另在 index.css）
- `frontend/src/components/writing/CharacterPreviewModal.jsx`：**删除**
- `frontend/src/components/writing/CharacterAnalyzingModal.jsx`：**删除**
- `frontend/src/components/index.js`：删除 `CharacterPreviewModal` 导出与空的 `// — Writing 专属 —` 段
- `frontend/src/pages/WritingSpacePage.jsx`：删除 `CharacterPreviewModal` / `CharacterAnalyzingModal` import；删除 `extractCharactersFromMessage` / `confirmCharacters` import；删除 state `cardPreviewChars` / `cardAnalyzing` 与 ref `makingCardRef`；删除 `handleMakeCard` / `handleConfirmCards` 两个函数；删除 `MessageList` 上的 `onMakeCard` prop；删除底部 AnimatePresence 中的两个 modal 块；移除空 import `pushToast`
- `frontend/src/api/writing-sessions.js`：删除 `extractCharactersFromMessage` / `confirmCharacters` 两个函数（对应后端路由仍在 `assistant/server/routes.js`，留给 Task 14 写卡助手对接处理）
- `frontend/src/components/chat/MessageList.jsx`：删除 `onMakeCard` prop 与转发
- `frontend/src/components/writing/WritingMessageItem.jsx`：删除 `onMakeCard` prop 与"制卡"按钮
- `frontend/tests/pages/writing-space-page.test.jsx`：删除 `extractCharactersFromMessage` / `confirmCharacters` mock 与 `CharacterPreviewModal` / `CharacterAnalyzingModal` 两个 vi.mock

**验证**：`npm run check` 全绿（frontend 48 文件 139 测试、backend、assistant 115 测试 + lint 全部通过）。

**残留**：assistant 端 `/api/assistant/extract-characters` `/confirm-characters` 路由及其测试仍在，由 Task 14 写卡助手对接统一处理；前端已无任何调用方。

## 2026-05-10 refactor: 整表删除 writing_session_characters；写作主 prompt 移除 [4]/[7] 角色段

**背景**：附近角色特性 Task 11（Option C）— 写作模式不再有"激活角色"概念，主 prompt 中的角色级段在写作模式下整体消失，角色出场由叙事文本驱动，nearby 池（Task 10 已落库）由副 LLM 单独维护状态。承接 Task 10 暂留的 CastPanel 文件与三个 active 角色 API。

**Prompt 段位变更**（`backend/prompts/assembler.js` `buildWritingPrompt`）：
- **[4] 角色 System Prompt 不注入**（`<char_info>` 段移除）
- **[7] 角色状态段不注入**（`<char_state>` 段移除）
- 写作 prompt 现含：[1] 全局 + [2] 常驻 cached + [3] 玩家 + [5] 世界状态 + [6] 玩家状态 + [8] 世界条目 + [8.5] 长期记忆 + [9] 召回摘要 + [10] 记忆展开 + [11] 日记 + [12] 历史 + [13+14] 后置/当前消息
- 锁定文件 `assembler.js` 已通过任务授权改动；`buildPrompt`（chat 模式）保持不变

**改动**：
- `backend/db/schema.js`：删除 `CREATE TABLE IF NOT EXISTS writing_session_characters` 块与 `CREATE INDEX ... idx_writing_session_characters_session_id`；在 `initSchema` 末尾追加迁移 `DROP TABLE IF EXISTS writing_session_characters`
- `backend/prompts/assembler.js`：`buildWritingPrompt` 删除 [4]/[7] 注入循环、`activeCharacters` 变量、`getWritingSessionCharacters` import、`tvChar` 闭包、`escapeXmlContent`/`escapeXmlAttr` 工具函数（仅这两段使用）；改写头部 jsdoc 与 cached/dynamic layer 注释；chat 路径完全未动
- `backend/prompts/entry-matcher.js`：state 条件评估写作分支由"对每个激活角色逐个评估"改为"含 `角色.*` 条件直接跳过"；删除 `getWritingSessionCharacters` import（chat 分支保留 `buildCharacterStateMap`/`mergeStateMaps`）
- `backend/memory/turn-summarizer.js`：写作模式 `characterIds` 直接置 `[]`（nearby snapshot 由本文件下方 nearby 段独立写入）；删除 `getWritingSessionCharacters` import
- `backend/routes/sessions.js`：编辑/删除消息路径写作模式 `characterIds = []`；删除 `getWritingSessionCharacters` import
- `backend/routes/session-state-values.js`：`/state-values` 写作模式不再聚合多角色 character 段，统一返回 `[]`；删除 import
- `backend/routes/writing.js`：删除 `GET/PUT/DELETE /:worldId/writing-sessions/:sessionId/characters` 三个端点；`runWritingStream` / `continue` / `regenerate` / `edit-assistant` 中所有 `getWritingSessionCharacters(...).map(c => c.id)` 替换为 `[]`；移除相关 import 与"CastPanel"日志注释
- `backend/services/writing-sessions.js`：删除 `getWritingSessionCharacters` / `addWritingSessionCharacter` / `removeWritingSessionCharacter` 三个 wrapper 与对应 db import 别名
- `backend/db/queries/writing-sessions.js`：删除同名三个查询函数；文件保留（其余 session CRUD 仍在用）
- `assistant/server/routes.js`：`/extract-characters` 与 `/confirm-characters` 创建角色卡后不再 `addWritingSessionCharacter`；删除 import；角色卡仍正常落 `characters` 表，只是不自动激活
- `frontend/src/components/book/CastPanel.jsx`：**删除**
- `frontend/src/components/index.js`：删除 `CastPanel` 导出
- `frontend/src/api/writing-sessions.js`：删除 `listActiveCharacters` / `activateCharacter` / `deactivateCharacter` 三个函数
- 测试同步：`backend/tests/prompts/assembler.test.js` 把"buildWritingPrompt 合并多角色条目"改写为"写作模式不注入 [4]/[7] 角色段"断言（`assert.doesNotMatch <char_info>/<char_state>`）；`backend/tests/prompts/assembler-shape.test.js` 删除 `INSERT INTO writing_session_characters`，写作分支锚点列表去掉 `ANCHOR_[3]_CHAR_*` 与 `ANCHOR_[6]_CHAR_STATE`；`__snapshots__/assembler-shape.snap` 同步更新；`backend/tests/routes/writing.test.js` 删除"写作会话角色管理路由可正常工作"测试与其他测试中残留的 `PUT /characters/:id` 调用与 `insertCharacter` 引用；`frontend/tests/api/writing-sessions.test.js` / `writing-space-page.test.jsx` 删除 `listActiveCharacters` 导入/mock 与 CastPanel mock
- 文档：`SCHEMA.md` 删除 `### writing_session_characters` 整节、删除策略段引用、state 条目语义段写作模式行为更新；`ARCHITECTURE.md` §4 buildWritingPrompt 段位差异表改写、§8 state 字段语义段更新、§9 writing 模式 `{{char}}` 替换说明、§11 数据模型表"激活角色"行替换为 nearby、§12 路由表注释更新

**验证**：
- `npm run test:backend` → 412 pass / 0 fail / 3 skip
- `npm run test:frontend` → 48 文件 / 139 测试全过
- `npm run lint` → 全过（前端 ESLint + assistant 语法检查 + git hygiene）
- grep 全 src 已无 `writing_session_characters` / `activateCharacter` / `deactivateCharacter` / `listActiveCharacters` / `CastPanel` / `getWritingSessionCharacters` / `addWritingSessionCharacter` 残留（仅 schema.js 的 DROP 迁移、CHANGELOG/SCHEMA/ARCHITECTURE 备忘、NearbyPanel.jsx 一行历史注释保留）

**坑点**：
- `entry-matcher` writing 分支只是"角色级条件不再触发"——选择的是 spec Option (a)。不重定向到 nearby，因为 nearby 的状态字段集是 character_state_fields 的子集（`nearby_enabled=1`），且 nearby 由副 LLM 维护，不参与世界 prompt 条目触发；如果未来需要 nearby 触发条目，再独立设计
- `captureStateSnapshot` / `restoreStateFromSnapshot` / `getSessionCharacterStateValues` 等下游均能正确处理 `characterIds=[]`（早就有 `if (characterIds.length === 0) return []` 类保护），实测验证通过
- `writing-session-characters.js` queries 文件保留为该文件还有 `getWritingSessionById` / `createWritingSession` 等 session CRUD；只删了 3 个角色相关函数
- `messages` 仍是 PUT 的 404：`backend/tests/routes/writing.test.js` 删除涉及该端点的所有调用，连带删除一并失效的 `insertCharacter` import

## 2026-05-10 feat(ui): NearbyPanel 替换 CastPanel — 附近区块 + 角色卡添加

**背景**：附近角色特性 Task 10 — 写作页右侧栏从 Cast（激活角色）切到 Nearby（附近角色池）。CastPanel 暂留文件系统（Task 11 删），与 `activeCharacters` 概念一同退出 WritingSpacePage。

**改动**：
- 新增 `frontend/src/components/book/NearbyPanel.jsx`：复制 CastPanel 骨架，去掉顶部印章行（无 Cast 概念），新增「附近」段（标题栏右侧两个动作 `＋角色卡` / `制卡`），保留「世界 / {{user}} / TIMELINE」三段。`useSessionState` 不动；nearby 由面板内 `useEffect + fetchNearby` 自管，依赖 `[worldId, sessionId, stateTick]`，setState 走 `Promise.resolve().then(...)` 规避 `react-hooks/set-state-in-effect`。
- 新增 `frontend/src/components/book/NearbyCharacterBlock.jsx`：单角色折叠块。已保存角色头部显示朱砂圆点 `we-nearby-seal`；记忆段 `we-nearby-memory` 点击进入编辑（textarea + 保存/取消）；状态部分复用 `StatusSection`，将后端的 `runtime_value_json` 一次性映射为 `effective_value_json` 给 StatusSection 读。写操作走 `setNearbySaved` / `patchNearbyMemory` / `patchNearbyState` / `removeNearby`，完成后 `onChange()` 触发父级 reload。
- 新增 `frontend/src/components/book/AddSavedNearbyModal.jsx`：列出 `getCharactersByWorld(worldId)`，按 nearby 当前名字集合去重（同名禁用「已在池中」），调 `addSavedNearbyFromCharacter`；409 提示「名字已在登场角色池中」。
- 新增 `frontend/src/components/book/MakeCardModal.jsx`：Task 12 占位，`return null`；保证 NearbyPanel 「制卡」按钮可挂接不崩。
- `frontend/src/pages/WritingSpacePage.jsx`：删除 `listActiveCharacters` import / `activeCharacters` state / `enterSession` 内 active chars 加载 / `handleConfirmCards` 内 `setActiveCharacters` 注入；`<CastPanel>` → `<NearbyPanel>`（去掉 `activeCharacters` / `onActiveCharactersChange` props）。CastPanel 保留在文件系统但不再被引用，待 Task 11 删除。
- `frontend/src/components/index.js`：注册 `NearbyPanel` / `NearbyCharacterBlock` / `AddSavedNearbyModal` / `MakeCardModal`。
- `frontend/src/index.css`：cast 块下追加 NearbyPanel 子样式 — `we-nearby-seal`（朱砂圆点 `var(--we-color-accent)` 8×8）、`we-nearby-memory`（左竖线 + 缩进段，`var(--we-text-sm)` + `var(--we-color-text-tertiary)`）、`we-nearby-memory-edit/-actions`（编辑态布局）、`we-nearby-section .we-state-section-reset` 兄弟间距。
- `frontend/tests/pages/writing-space-page.test.jsx`：新增 `NearbyPanel.jsx` 模块 mock；将三处 `waitFor(listActiveCharacters)` 断言换成 `waitFor(listWritingSessions)`，因为 active chars 加载链路已删。

**验证**：`npm run lint` 全过；`cd frontend && npm run test` → 48 文件 / 139 测试全过。

**坑点**：
- `StatusSection` 只读 `effective_value_json`，nearby 后端只给 `runtime_value_json`，必须在 NearbyCharacterBlock 内做一次映射；`onSave` 仍传原始 valueJson 给 `patchNearbyState`。
- `react-compiler` 严格 useMemo 依赖：`[nearby?.state]` 被判 "less specific than inferred"，改成 `[nearby]` 才过 lint。
- 旧 `handleConfirmCards`（章节内提取角色）仍可调；现在不再写 `activeCharacters`，新角色卡直接落库到 `characters` 表，由 Task 11 后续统一清理 active 概念。
- `MakeCardModal` 在 NearbyPanel 内是真打开（state 控制），但组件 `return null`；点击「制卡」无可见反馈是预期，Task 12 才补可视实现。

## 2026-05-10 feat(api): session-nearby 前端 API 封装

**背景**：附近角色特性 Task 9 — 给前端补齐 nearby 全链路 API 封装，配合 Task 5/8 的后端路由。

**改动**：
- `frontend/src/api/session-nearby.js`（新文件，~60 行）：基于现有 `request` wrapper 导出 10 个方法 — `fetchNearby` / `addSavedNearbyFromCharacter` / `patchNearby` / `setNearbySaved` / `patchNearbyMemory` / `patchNearbyName` / `patchNearbyState` / `removeNearby` / `analyzeNearbyForCard` / `createCharacterFromNearby`；URL 前缀 `/api/worlds/:worldId/writing-sessions/:sessionId/nearby/...`。

**验证**：人工 grep 确认 import 路径与方法名；调用方接入留待 Task 10/11。

**坑点**：`writing-sessions.js` 用裸 `fetch`、`characters.js` 用 `request` wrapper；新文件统一走 `request` 以获得 4xx/5xx 自动抛错和 204 处理。`activateCharacter` / `deactivateCharacter` 暂留在 `writing-sessions.js`，由 Task 11 统一清理。

## 2026-05-10 feat(card): nearby → 公共角色卡 制卡服务 + 路由

**背景**：附近角色特性 Task 8 — 让用户把会话内的 nearby 角色"制成"公共角色卡，分两步：先 LLM 生成草稿，再用户确认后落库。

**改动**：
- `backend/services/nearby-card-maker.js`（新文件）：
  - `analyzeNearbyForCard(sessionId, nearbyId)`：取 nearby 行 + state values + 最近 6 轮（≤12 条）消息，拼 prompt 调 `llm.complete`（temp 0.7、max 1024、`configScope = resolveAuxScope(sessionId)`、`callType: 'nearby_card_analyze'`）。返回 `{ name, system_prompt, description, first_message }`，`name` 透传 nearby 当前名；LLM 非法 JSON 抛 `Error('LLM returned invalid JSON')`。
  - `createCharacterFromNearby({ worldId, sessionId, nearbyId, name, system_prompt, description, first_message })`：校验 session 属 world、nearby 属 session；`createCharacter` 写入 `characters` 表（`post_prompt=''`、`avatar_path=null`）；过滤 `character_state_fields.nearby_enabled === 1` 的字段，把 nearby 的 `runtime_value_json` 写入新角色的 `default_value_json`（不写 runtime、不带 memory、不带 nearby id）。返回新 charId。校验失败抛带 `code` 的 Error（`NEARBY_NOT_FOUND` / `SESSION_NOT_FOUND` / `NEARBY_SESSION_MISMATCH` / `SESSION_WORLD_MISMATCH`）。
- `backend/routes/writing.js`：新增 `POST /api/worlds/:worldId/writing-sessions/:sessionId/nearby/:nearbyId/analyze`；错误走既有 `handleNearbyError`。
- `backend/routes/characters.js`：新增 `POST /api/worlds/:worldId/characters/from-nearby`，必须排在 `:id` 系列前。错误码映射：`NEARBY_NOT_FOUND`/`SESSION_NOT_FOUND` → 404，`*_MISMATCH` 与 `name required` → 400，其它 500。
- `backend/tests/services/nearby-card-maker.test.js`（新文件，4 用例）：mock LLM 走 `MOCK_LLM_COMPLETE` 环境变量；用例覆盖①草稿 name 透传 + LLM 三字段、②LLM 非 JSON 抛错、③仅启用字段写 default_value_json + runtime/memory/nearby id 不写、④校验错误（缺 name / nearby 不存在 / session 跨 world）。

**验证**：
- `cd backend && node --test tests/services/nearby-card-maker.test.js` → 4/4 pass。
- `npm run test:backend` → 413 pass / 0 fail / 3 skip，无回归。
- `npm run lint` → 通过。

**坑点**：
- writing session 与 chat session 共用 `sessions` 表（`mode='writing'`），无独立 `writing_sessions` 表；`getWritingSessionById` 仅多一个 `mode='writing'` 过滤。
- mock LLM 的标准做法是 `process.env.MOCK_LLM_COMPLETE = ...`，无需 `mock.method` / 注入参数；service 不为测试改生产 API。
- characters 路由把 `from-nearby` 放在 `:id` 系列之前，避免 Express 把 `from-nearby` 当作 `:id`。

## 2026-05-10 feat(state): turn_records snapshot 增加 nearby 层 + 回滚还原

**背景**：附近角色特性 Task 7 — 让每轮 turn record 的 `state_snapshot` 同时记录 nearby 池与其状态，使消息编辑/regenerate 回滚能精确还原"本轮登场角色"。

**改动**：
- `backend/memory/turn-summarizer.js`：在 `captureStateSnapshot` 之后，仅当 `session.mode === 'writing'` 时把 `listNearbyBySessionId` + `getStateValuesByNearbyId` 拼成 `snapshot.nearby = [{id,name,memory,is_saved,state}]`，与 world/persona/character 并列写入 JSON。chat 模式不写该字段（向下兼容）。
- `backend/memory/state-rollback.js`：`restoreStateFromSnapshot`
  - `snapshot=null` 分支追加：清空 nearby 两张表（CASCADE）。
  - 主路径末尾追加：先 `deleteNearbyById` 全删旧 nearby（CASCADE 同步清 state values），再按 `snapshot.nearby` 数组用 `createNearbyCharacter` + `upsertNearbyStateValue` 重建；id 不复用、新发 UUID；缺失/非数组（旧记录） → 仅清空（向下兼容）。
- `backend/tests/memory/state-rollback.test.js`：新增 2 个用例
  - 含 nearby 层 → 还原后旧 nearby 被清掉、name/memory/is_saved/state 全部回写、id 不复用；
  - 缺 nearby 字段（旧记录） → nearby 两张表清空。
- `SCHEMA.md`（本地，gitignored）：`turn_records.state_snapshot` JSON 示例添加 nearby 层 + 还原行为说明。

**验证**：
- `cd backend && node --test tests/memory/state-rollback.test.js` → 5/5 pass（原 3 + 新 2）。
- `npm run test:backend` → 409 pass / 0 fail / 3 skip，无回归。

**坑点**：
- snapshot 中保存的 nearby `id` 不复用：写作模式下 turn 之间不依赖 id 稳定（语义层只关心 name/state/memory/is_saved），新发 UUID 与池内现有约束更安全。
- `nearby: []` 与 `undefined nearby` 必须区分——前者代表"启用 nearby 但本轮空池，回滚要清干净"，后者代表旧记录无该字段、走向下兼容（同样清空，但语义不同）。
- nearby 层只在 `mode==='writing'` 时写入；chat 会话的 `session_nearby_characters` 始终为空，CASCADE 自然处理，无需特殊分支。

## 2026-05-10 feat(state): combined-state-updater 集成 nearby pool + applyNearbyResult

**背景**：附近角色特性 Task 6 — 在 `mode === 'writing'` 的同一次状态更新 LLM 调用里，让模型同时输出 `nearby_characters` 数组（本轮登场角色），并应用到 `session_nearby_characters` / `session_nearby_character_state_values`。

**改动**：
- 新建 `backend/prompts/nearby-prompt.js`：`buildNearbyPromptSection(pool, fields)`，渲染池条目 + nearby_enabled 字段定义 + 5 条任务说明；空池有简化文案。
- `backend/memory/combined-state-updater.js`：
  - 引入 nearby queries 与 `buildNearbyPromptSection`；
  - `updateAllStates` 按 `session?.mode === 'writing'` 组装 pool（`{id, name, is_saved, memory, state}`，state 由 `getStateValuesByNearbyId` 反序列化），追加 nearby 段，response keys 增加 `nearby_characters`；
  - 解析 patch 后，`isWriting` 时调用新增导出 `applyNearbyResult({ sessionId, worldId, fields, nearby_characters, pool })`；chat 模式分支不动；
  - `applyNearbyResult` 实现 6 条规则：ref_id 命中→更新 name/memory/state；ref_id=null+name 命中等同更新；ref_id=null+name 不在池→创建 transient（is_saved=0）；非法 ref_id 整条丢弃；池里没回的 transient 由 `deleteTransientNotInIds` 删（saved 全部保留）；未启用字段直接跳过。**复用本文件已有 `validateValue`**，避免与主 state patch 行为漂移。
  - `__testables` 新增 `applyNearbyResult` 导出。
- 新建 `backend/tests/memory/combined-state-updater-nearby.test.js`（node:test + sandbox），6 个场景全部 PASS。

**验证**：
- `cd backend && node --test tests/memory/combined-state-updater-nearby.test.js` → 6/6 pass。
- `cd backend && node --test tests/memory/combined-state-updater.test.js` → 4/4 pass，无回归。
- `npm run test:backend` → 410 pass / 0 fail / 3 skip。

**坑点**：
- `validateValue` 故意未抽出到独立 helper 文件——它依赖闭包 logger/常量；与 `applyNearbyResult` 同文件共享同一份校验，避免 serializer 漂移（spec 强调"必须复用"）。
- 改名时先在池里查同名占用，避免 nearby `(session_id, name)` UNIQUE 冲突；冲突仅 warn 不抛。
- 新建 transient 若仍 UNIQUE 冲突（极端情况），降级为复用同名既存行，不阻塞主流程。
- nearby 段插在 sections 末尾（与 persona 并列），response keys 同步追加；位置不影响协议正确性。

## 2026-05-10 feat(route): nearby characters HTTP 路由 + 集成测试

**背景**：附近角色特性 Task 5 — 在 service 层（Task 4）之上暴露写作会话登场角色 HTTP 路由。

**改动**：
- `backend/routes/writing.js`：新增登场角色路由段（按现有 `/:worldId/writing-sessions/:sessionId/...` mount 风格落点）：
  - `GET    /:worldId/writing-sessions/:sessionId/nearby` → 200 list
  - `POST   /:worldId/writing-sessions/:sessionId/nearby`（body `{ character_id }`） → 201 `{ id }`；缺 `character_id` 返回 400（路由层校验，不进 service）
  - `PATCH  /:worldId/writing-sessions/:sessionId/nearby/:nearbyId`（body `{ is_saved? | memory? | name? }`）按 name → is_saved → memory 顺序调用 service，最后 `listNearby` 取该项返回；重名 409
  - `PATCH  /:worldId/writing-sessions/:sessionId/nearby/:nearbyId/state`（body `{ field_key, value_json }`） → 200 `{ ok: true }`；缺 `field_key` 400；字段未启用 400
  - `DELETE /:worldId/writing-sessions/:sessionId/nearby/:nearbyId` → 204
  - `handleNearbyError(err, res)` 统一映射：`code === 'NEARBY_NAME_CONFLICT'` → 409；`/not found/i` → 404；`/required|not enabled|world mismatch|not in this world/i` → 400；其它 500 + log.error
- `backend/tests/routes/writing-nearby.test.js`：node:test + `createRouteTestContext` + fetch（与 `writing.test.js` 一致风格）8 个用例覆盖：POST+GET 正常路径、POST 缺参 400、POST 重名 409、PATCH is_saved 切换 200、PATCH 重命名冲突 409、PATCH state 200、PATCH state 缺 field_key 400、DELETE 204。

**坑点**：service 实际抛错文案是 `character world mismatch: ...` 而非 plan 描述里的 `'Character not in this world'`，因此 `handleNearbyError` 的 400 正则把 `world mismatch` 也加进去（兼容 plan）。POST 缺 `character_id` 走路由层校验（400），不走 service 的「character not found」路径（那条是 404），语义不同。

**验证**：`npm run test:backend` → 401/404 pass（3 skipped，无回归，新增 8 个 nearby 路由用例全部通过）。

## 2026-05-10 feat(service): nearby characters CRUD service 层 + 单测

**背景**：附近角色特性 Task 4 — 在 queries 层（Task 2/3）之上提供写作会话级登场角色 CRUD 业务逻辑层。

**改动**：
- `backend/services/writing-sessions.js`：追加 7 个导出函数 `listNearby` / `addSavedFromCharacter` / `removeNearby` / `setNearbyIsSaved` / `patchNearbyMemory` / `renameNearby` / `patchNearbyState`，以及内部辅助 `ensureWritingSession` / `ensureNearbyOwned` / `getNearbyEnabledFields` / `buildNearbyRow` / `nameConflictError`。
  - `addSavedFromCharacter`：校验 session 存在、character 存在且 world 匹配、name 在 session 内未被占用（占用抛 `Error.code='NEARBY_NAME_CONFLICT'`）；建 nearby（is_saved=1, memory=''），从 `character_state_values.default_value_json` 复制到 nearby state，仅复制 `nearby_enabled=1` 字段，`default_value_json IS NULL` 跳过。
  - `renameNearby`：trim 后非空校验；与当前 name 一致时为 no-op；其它人占用抛 `NEARBY_NAME_CONFLICT`。
  - `patchNearbyState`：写入字段必须存在于该 world 且 `nearby_enabled=1`，否则抛错。
  - `listNearby` 返回结构：`{ id, session_id, name, memory, is_saved, created_at, updated_at, state: [{ field_key, label, type, description, enum_options, min_value, max_value, prefix, unit, table_columns, runtime_value_json }] }`，state 仅包含启用字段，未写入字段 `runtime_value_json=null`。
- `backend/tests/services/nearby-characters.test.js`：node:test 9 个用例覆盖：仅复制启用字段 + listNearby 形状、name 占用冲突、跨 world 拒绝、CASCADE 删 state、跨 session 拒绝、is_saved 切换、memory null→空串、改名/重名/同名 no-op/空名拒绝、patchNearbyState 启用 OK/未启用拒绝/不存在拒绝。

**坑点**：fixtures `insertCharacterStateField` 的 INSERT 不含 `nearby_enabled` 列（schema ALTER 加默认值 1，因此插入后默认为 1）；要测"未启用字段"需在测试 setup 用 raw SQL `UPDATE character_state_fields SET nearby_enabled=0` 显式置 0，避免改 fixtures.js 影响面。`getCharacterStateFieldsByWorldId` 用 `SELECT *` 已自动带出 `nearby_enabled` 列。

**验证**：`cd backend && node --test tests/services/nearby-characters.test.js` → 9/9 pass；`npm run test:backend` → 393/396 pass（3 skipped，无回归）。

## 2026-05-10 feat(db): session-nearby-characters queries + 单测

**背景**：附近角色特性 Task 2 — 在 schema（Task 1）之上为 `session_nearby_characters` 表提供 CRUD + 清理 queries 层。

**改动**：
- `backend/db/queries/session-nearby-characters.js`：新增 `createNearbyCharacter` / `getNearbyById` / `getNearbyByName` / `listNearbyBySessionId` / `updateNearbyName` / `updateNearbyMemory` / `updateNearbyIsSaved` / `deleteNearbyById` / `deleteTransientNotInIds`。沿用 `import db from '../index.js'` 项目惯例；id 用 `crypto.randomUUID()`，时间戳用 `Date.now()`。`listNearbyBySessionId` 排序为 `is_saved DESC, created_at ASC`（saved 置顶）。`updateNearbyIsSaved` 接 truthy/falsy 一律转 0/1。`getNearbyById` / `getNearbyByName` 未命中返回 `null`（`?? null`）。
- `backend/tests/db/queries/session-nearby-characters.test.js`：node:test + sandbox/fixtures 模式（项目实际惯例，非 plan 文中 vitest），10 个测试覆盖默认值、UNIQUE 冲突、列表排序、命中/未命中、updated_at 刷新、is_saved 强转、删除、cleanup 保留 saved/白名单、空 keepIds。

**坑点**：`deleteTransientNotInIds(sessionId, [])` 若直接拼 `id NOT IN (NULL)`，SQLite 三值逻辑下整体为 NULL（≠ TRUE），结果一行都不删——与"清空白名单 = 删全部 transient"语义相反。实现里改成 `keepIds.length === 0` 时走不带 `NOT IN` 的分支，单测 `空数组时删除所有 transient` 专门覆盖此路径。

**验证**：`cd backend && node --test tests/db/queries/session-nearby-characters.test.js` → 10/10 pass。

## 2026-05-10 feat(db): 新增 session_nearby_characters 表与 character_state_fields.nearby_enabled 列

**背景**：实施"附近 / 登场角色"特性 Task 1（DB schema），spec `docs/superpowers/specs/2026-05-10-nearby-characters-design.md` §3。

**改动**：
- `backend/db/schema.js`：在 TABLES 字符串内 `writing_session_characters` 块之后追加两张新表 `session_nearby_characters`（session 内出场角色，含 transient 与 saved 两类，UNIQUE(session_id, name)）和 `session_nearby_character_state_values`（nearby 角色的会话级状态值，UNIQUE(nearby_id, field_key)）；外键全部 `ON DELETE CASCADE`。在 `initSchema` 末尾追加 `ALTER TABLE character_state_fields ADD COLUMN nearby_enabled INTEGER NOT NULL DEFAULT 1`，旧行由 SQLite 默认值自动填 1；同时为两张新表补建索引 `idx_session_nearby_characters_session_id`、`idx_session_nearby_character_state_values_nearby_id`。
- `SCHEMA.md`：在 `writing_session_characters` 段加上"将整表删除"备注；新增 `session_nearby_characters` / `session_nearby_character_state_values` 两节；`character_state_fields` 表加上 `nearby_enabled` 行。

**注意**：本仓库迁移段统一用 `try { db.exec(\`ALTER TABLE ... ADD COLUMN ...\`); } catch {}` 模式，不存在 plan 文中提到的 `ensureColumn` 助手；沿用现有模式即可达到"列已存在则忽略"的效果。

**验证**：`cd backend && npm test` 全绿（369 pass / 3 skip）。

## 2026-05-10 chore(desktop): 瘦身 Node 运行时 + 限制 Electron 语言包，三平台再减重 ~25%

**问题**：在按 arch 过滤 Node 运行时之后（前一条 changelog），mac-arm64 .app 仍 516M。继续拆解发现两块冗余：
- 每份打包内的 Node 运行时附带 `include/`（66M C++ 头文件）、`lib/node_modules/npm`（15M）、`share/`、`README.md`/`CHANGELOG.md`/`LICENSE`、以及 `bin/{npm,npx}` 软链；win32 同理含 `node_modules/npm`、`npm*`/`npx*` 启动脚本和 `install_tools.bat` 等。Backend 通过 `spawn(node, ['server.js'])` 调用，根本不用这些。
- Electron 默认随包附带 55 套 .lproj 语言资源（mac 约 45M），WorldEngine 是简中应用，不需要其它语言。

**改动**：
- `desktop/scripts/prepare-build.js`：新增 `slimRuntime(runtimeDir, platform)`，在 `prepareRuntime()` 末尾调用；同时在缓存命中分支也调一次保证旧缓存幂等清理。darwin 删 `include/`、`share/`、`lib/node_modules/`、`bin/npm`、`bin/npx`、根目录三份文档；win32 删 `node_modules/`、所有 `npm*`/`npx*` 启动脚本、`install_tools.bat`、`nodevars.bat`、文档。瘦身后 darwin 仅留 `bin/node`，win32 仅留 `node.exe`。
- `desktop/electron-builder.json`：顶层加 `"electronLanguages": ["en", "zh_CN", "zh_TW"]`，把 Electron 语言资源从 55 套裁到 3 套。

**实测结果**（与"前一条 changelog 后"对比）：

| 产物 | 上轮 | 这轮 |
|---|---|---|
| mac-arm64 .app | 516M | **390M** |
| mac-x64 .app | 551M | **420M** |
| win-unpacked | ~520M | **433M** |
| mac-arm64.dmg | 174M | **151M** |
| mac-x64.dmg | 182M | **159M** |
| win-x64.exe (nsis) | — | **119M** |

累计三平台 DMG/EXE 较最初分别减重 44% / 42% / 59%。

**验证**：`cd desktop && npm run dist` → 检查 `dist/{mac-arm64,mac}/WorldEngine.app/Contents/Resources/node/<arch>/` 仅含 `bin/node`；`dist/win-unpacked/resources/node/win32-x64/` 仅含 `node.exe`；mac .app 中 `Frameworks/Electron Framework.framework/Versions/A/Resources/` 仅含 `en.lproj`/`zh_CN.lproj`/`zh_TW.lproj`。启动 .app 后通过 `pgrep` 确认后端进程使用瘦身后的 `bin/node` 正常拉起。已实测通过。

---

## 2026-05-10 chore(desktop): 按目标 arch 过滤 Node 运行时，安装包减重 ~38%

**问题**：mac arm64 .app 实测 832MB（DMG 272MB），其中 `Resources/node/` 单独占 522MB——每个平台/架构的安装包都把全部三套 Node.js 运行时（darwin-arm64 / darwin-x64 / win32-x64）一起打了进去。`desktop/electron-builder.json` 顶层 `extraResources` 把 `node-runtime/` 整目录无差别注入，没按目标平台过滤。

**改动**：`desktop/electron-builder.json`：
- 删除顶层 `extraResources` 中 `node-runtime → node` 那条。
- `mac.extraResources` 新增 `{ from: "node-runtime/darwin-${arch}", to: "node/darwin-${arch}" }`，多 arch 构建时 `${arch}` 会按 arm64/x64 分别展开，各包只包含自身 runtime。
- `win.extraResources` 同理 `win32-${arch}`。
- `desktop/scripts/prepare-build.js` 不变，开发期仍预下载三套以便复用缓存。
- `desktop/src/main.js` 的 `node/${process.platform}-${process.arch}` 路径解析与新目录天然吻合，无需改动。

**实测结果**（electron-builder 26.8.1）：

| 产物 | 改前 | 改后 |
|---|---|---|
| mac-arm64 .app | 832M | **516M**（-316M / -38%） |
| mac-x64 .app | ~830M | **551M** |
| mac-arm64.dmg | 272M | **174M** |
| mac-x64.dmg | 272M | **182M** |

**验证**：`cd desktop && npm run build` → 检查 `dist/mac-arm64/WorldEngine.app/Contents/Resources/node/` 应**仅含** `darwin-arm64`（mac-x64 同理仅含 `darwin-x64`）；启动 .app 后通过 `pgrep` 确认后端进程使用包内 `darwin-arm64/bin/node` 拉起 `backend/server.js`。已实测通过。

---

## 2026-05-10 fix(frontend): list 类型状态字段 chip 展开模板变量

**问题**：`StatusSection.jsx` 新增 tag 渲染路径时直接输出原始 `item`，导致 list 字段中的 `{{user}}`/`{{char}}`/`{{world}}` 显示为字面量，而 text 字段仍正常展开。

**改动**：`arr.map` 内每个 chip 改为 `applyTemplateVars(item, templateCtx)` 展开后渲染，与 text 字段行为一致。

**验证**：在状态栏 list 字段写入含 `{{user}}` 或 `{{char}}` 的条目，确认书卷面板显示展开后的名称。

---

## 2026-05-10 fix(frontend): 状态栏迟到事件不再被丢弃，修复连续对话状态/dairy_time 延迟一轮才更新

**问题**：用户连发消息时，状态面板（含 real_time 模式的 `dairy_time`）经常延迟一轮甚至几轮才刷新。后端 `updateAllStates` 实际上每轮都把 `dairy_time` 同步写进了 DB，且 `state_updated` SSE 也通过上一轮 response 流（`keepSseAlive=true`）正常发出；问题出在前端：`ChatPage.jsx` / `WritingSpacePage.jsx` 的 `onStateUpdated`/`onStateRolledBack` 用 `isCurrentStreamRun(runId)` 或 `continuationTokenRef` 拦截"非当前轮"的事件——一旦用户在第 N 轮 p2 任务完成前提交第 N+1 轮，第 N 轮迟到的 `state_updated` 即被丢弃，面板要等下一轮刷新才能看到第 N 轮已写入 DB 的状态。

**改动**：
- `frontend/src/pages/ChatPage.jsx` / `frontend/src/pages/WritingSpacePage.jsx`：把 `onStateUpdated`/`onStateRolledBack`/`onTitleUpdated`/`onChapterTitleUpdated` 这些 session 级事件的门控从 stream 级的 `runId`/`continuationToken` 换成 **session 级**比较——回调创建时捕获 `callbackSessionId`，事件到达时只比较当前 session 是否仍是同一个：
  - 同 session 内迟到事件（用户已开新一轮）必须刷新 → 修复"过了一轮才更新"。
  - 切到别的 session 时丢弃 → 防止跨 session 状态/标题串台。
  - `onTitleUpdated` 把侧边栏 `updateTitle` 始终用捕获的 `callbackSessionId` 推送，保证哪怕用户切走，目标 session 的标题仍能在列表里更新；只有"当前页 setCurrentSession"才按 isSameSession 门控。
- `stopMemoryWriting(runId)` 自带 runId 自守卫保留不变（仅关闭本轮 UI 动画）。
- 后端不动。

**Codex review 反馈修复**：`makeCallbacks(runId, sessionIdHint?)` / `makeStreamCallbacks(runId, sessionIdHint?)` 接受调用方显式传入 sessionId。`handleSend` 首次发送时会先 `createSession + enterSession` 再立即构造回调，此时 `currentSessionIdRef` 还未被 effect 同步，若仍读 ref 会捕获到 `null`，导致首轮 `state_updated`/`title_updated` 被丢弃；现在三个调用点（chat sendMessage、writing generate/edit-regen/regen）均显式传入对应 sessionId 兜底。

**验证**：连发 3-5 轮消息（每次 assistant 输出后立即再发），状态面板的 LLM 字段与 `dairy_time` 应在该轮 p2 完成后及时更新，不再"过了一轮才看到"。

## 2026-05-10 fix(state): list 字段超限不收敛的兜底链路

**问题**：用户反馈 `外貌` list 字段累计 13+ 条，多轮对话后仍未收敛到 8。原因是 `compressOverLimitFields` 只检查本轮 patch 中出现的字段；若 LLM 当轮没有把该字段塞进 patch（外貌等"近似静态"字段常如此），即使现有 runtime 值已远超 10，也不会进入压缩或硬截断分支，于是历史超限永远保留。

**改动**（`backend/memory/combined-state-updater.js`）：
1. `compressOverLimitFields` 新增 `valueMap` 参数，对每个活跃实体也扫描现有 runtime 值；patch 未提及但已超限的 text/list 字段同样进入压缩队列。
2. `updateAllStates` 把已计算的 `worldValueMap` / `charValueMaps[i]` / `personaValueMap` 提升到外层作用域并下传给压缩函数，避免重复查询。
3. 压缩 LLM 返回失败/空/格式不符时，原本"静默放弃"，现改为以 `value.slice(-STATE_LIST_TRIM_TARGET)` 硬截取作为兜底写回 patch；新增 `ensureBucket(entityKey)`：当 LLM 返回畸形顶层桶（如 `"world": "..."`、`"char_0": 1`）时直接覆盖为 `{}`，避免对字符串/数字赋属性触发严格模式 TypeError 中断整个状态更新（修复 codex review 指出的回归）。

**验证**：(1) `npm run test:backend` 全绿（369 通过）；(2) 用户场景下次状态更新轮触发：日志会出现 `COMPRESS  list=1`，并写出 `COMPRESS LIST OK` 或 `COMPRESS LIST FALLBACK`，前端列表收敛到 ≤8 条。

## 2026-05-10 feat(entry): 关键词条目 active_turns=0 增加永久生效提示与列表徽标

**改动**：
- `EntryEditor.jsx`：关键词类型 `active_turns=0` 时，在输入框下方显示书卷风提示框 "✦ 此条目一旦命中将永久生效，不再随轮次衰减。"，并在标签后追加 hint " · 设为 0 永久生效"。
- `EntrySection.jsx`：关键词条目 `active_turns=0` 且未禁用时，在标题后渲染"永久"徽标（复用 `we-entry-cached-badge` 样式），与 always token=0 的 CACHED 徽标统一。

**验证**：编辑关键词条目把生效轮数改为 0 → 编辑器内出现永久生效提示；列表中标题旁出现"永久"徽标。

## 2026-05-10 style(entry): 触发范围复选框统一书卷风 + 修复 CACHED LAYER 提示覆盖

**改动**：
- `frontend/src/styles/ui.css` 给 `.we-entry-editor-scope-item input[type="checkbox"]` 增加书卷风样式：`appearance:none`、`--we-color-border-default` 直角描边，勾选时 `--we-color-accent` 填充 + 内嵌 SVG 对勾（米色描边居中），去掉浏览器蓝勾，也避免 `✓` 字符在 13px 方块内偏移细弱。
- `.we-entry-editor-cached-note` 去掉负 `margin-top`，改为正 `--we-space-sm`，修复 "✦ 此条目将进入 CACHED LAYER..." 提示覆盖到上方"顺序权重"输入框的问题。

**验证**：(1) 条目编辑器 `trigger_type='keyword'` 下勾选/取消触发范围，复选框为陶土色直角方块 + 米色对勾；(2) `trigger_type='always'` 且 token=0 时，CACHED LAYER 提示在输入框下方独立成行不重叠。

## 2026-05-10 feat(entry): 关键词条目支持 AND/OR、user/assistant 触发范围、生效轮数

**目标**：把关键词条目升级到与状态条件条目同等的表达能力。三个新能力：(1) 关键词命中支持 AND/OR；(2) `keyword_scope` 暴露到前端，可选 user / assistant（多选，默认 user，空选保存报错）；(3) 关键词命中后可"持续生效 N 轮"（`active_turns`，0=永久、1=本轮、N=之后 N 轮）。

**Schema 变更**（`backend/db/schema.js`，全部 ALTER 追加）：
- `world_prompt_entries`：新增 `keyword_logic TEXT NOT NULL DEFAULT 'OR'`、`active_turns INTEGER NOT NULL DEFAULT 1`。`keyword_logic` 默认 OR 保持向后兼容（命中等同改造前）。仅对 `trigger_type='keyword'` 生效。
- `sessions`：新增 `keyword_active_state TEXT NOT NULL DEFAULT '{}'`，JSON 结构 `{ entry_id: { round, ttl } }`，跨轮持久化激活状态。

**命中匹配（`backend/prompts/entry-matcher.js`）**：
- `matchByKeywords` 改写：先用 `keyword_scope` 限定扫描面（user / assistant 任一 scope 出现即视为该关键词命中），再按 `keyword_logic` 决定 AND（所有关键词都命中）或 OR（任一命中）。
- 新增跨轮 TTL 逻辑：`currentRound` 取 session 内 user 消息总数（regenerate 不增、edit 后回退，符合直觉）；本轮新命中刷新 `state[id] = { round, ttl }`；旧记录 `ttl=0` 永久生效，`ttl>=1` 在 `currentRound - round < ttl` 期间继续注入；过期 / 条目被删自动清理。状态写入 `sessions.keyword_active_state`，新建 `backend/db/queries/session-active-entries.js` 封装读写。

**校验**：`backend/db/queries/prompt-entries.js` 新增 `KeywordScopeEmptyError`，前端显式提交空 `keyword_scope`（数组 / 字符串）时抛错；`backend/routes/prompt-entries.js` 在 POST/PUT 捕获并返回 400 + 中文提示。前端保存按钮也先做一次校验，双层防护。

**前端 EntryEditor**（`frontend/src/components/state/EntryEditor.jsx` + `frontend/src/styles/ui.css`）：
- 顺序权重与生效轮数同行布局（`we-entry-editor-inline-row` / `we-entry-editor-inline-col`），生效轮数仅在 keyword 类型显示。
- 关键词类条目新增触发范围多选（user / assistant 复选框）+ AND/OR 切换（复用状态条件已有的 `we-entry-condition-logic-row` 样式）。
- form 状态加载时把 `keyword_scope` 字符串解析为数组，提交前 `.join(',')` 转回字符串。新建条目默认勾选 `['user']`。

**导入导出**（`backend/services/import-export.js`）：`exportWorld` SELECT 增加 `keyword_logic` / `active_turns`；`insertPromptEntries` INSERT 列、参数同步扩展，旧卡缺字段时回退 `'OR'` / `1`。

**写卡助手对齐**（`assistant/`）：
- `knowledge/WORLDCARD.md` 字段说明加入 `keyword_logic` / `active_turns`，并补充 AND + 仅 user + 持续 3 轮的示例；`keyword_scope` 同步标注"留空会被后端拒绝"。
- `server/normalize-proposal.js` 解析时归一化两个新字段，`keyword_scope` 空集合宽容回退 `'user,assistant'`（避免提案直接被后端 400）；`updateWorldPromptEntry` 的 pickAllowed 白名单补 `keyword_logic` / `active_turns` / `condition_logic`（同步修复 condition_logic 之前未列入的遗漏）。
- `server/tools/apply-world-card.js` 的工具描述补一句字段提示，让 LLM 在不读 WORLDCARD.md 的情况下也能感知新字段。

**坑点 / 已知约束**：
- AND 语义判断的是"所有关键词在所选 scope 集合中至少各出现过一次"，不要求同一句、同一条消息、同一 scope。如需"同消息共存"语义，未来再扩展。
- TTL 计数挂在 session.user 消息总数上。**历史回退保护**（Codex review 修复）：当 `record.round > currentRound`（用户删消息 / 编辑早期消息 / 清空会话）时，触发该条目的消息已不存在，直接丢弃 carry-over 记录，避免 `active_turns=0` 永久条目变成幽灵注入。
- `condition_logic` 与 `keyword_logic` 故意分开两列：语义不同（一个针对 entry_conditions 行集，一个针对 keywords 数组），分开避免未来歧义。
- 前端 EntryEditor 新建关键词条目时 `keyword_scope` 默认勾选 user + assistant（与后端 schema、写卡助手归一化、导入兜底全部对齐；初版只勾 user 为不一致 bug，已修）。

---

## 2026-05-09 fix(state): list 字段硬上限 10、满则先删；修复压缩兜底静默失败导致列表无限增长

**Bug**：`combined-state-updater.js#compressOverLimitFields()` 在调用 LLM 压缩超长 list 时，若压缩调用返回空字符串、JSON 解析失败、或返回结构缺字段，会静默放过原 patch；而 `validateValue` 的 `case 'list'` 没有任何长度校验，导致超长数组（实测 20+ 条）原样写入 `runtime_value_json`，下一轮 prompt 又把全部条目展示给 LLM，越滚越多。

**修复**：
1. `validateValue` list 分支末尾增加硬截断：长度 > `STATE_LIST_MAX_ITEMS` 时保留**末尾** 10 条（`slice(-10)`）+ 输出 `LIST HARD TRUNCATE` 警告，作为兜底兜底；保留尾部而非头部是因为 LLM "替换整个列表"通常把新事实追加在末尾，截头部会丢本轮新增。
2. `compressOverLimitFields` 接收压缩结果时，要求返回数组长度在 `[1, STATE_LIST_MAX_ITEMS]` 区间内才覆盖 patch，否则记录 `COMPRESS LIST FAIL` 让硬截断接手。
3. `STATE_LIST_TRIM_TARGET`：`5` → `8`（按用户要求保留更多上下文）。
4. `state-update.md` 第 6 条改写：明确告知 LLM 每个 list 字段最多 10 个条目，已满 10 又要新增时必须先剔除一条旧条目。
5. 前端 `StateValueField.jsx` list 编辑器同步硬限制 10：满额时输入框 `disabled` 并显示「已达上限 10 条，请先删除」，`addListItem` 在 `>=10` 时直接 return。

**未改**：不动 DB schema，现有超长列表会在下一次 LLM 状态更新或用户编辑时被硬截断/压缩自然收敛。

---

## 2026-05-09 feat(state): 数值类型状态字段支持单位

**变更**：`world_state_fields` / `character_state_fields` / `persona_state_fields` 新增 `unit TEXT NOT NULL DEFAULT ''` 列（schema.js 用 ALTER 迁移）。`StateFieldEditor` 在 type=number 时新增「单位」输入（最长 16 字符，与 min/max 同行）。

**渲染**：`StatusSection` 数值显示在末尾拼上单位（含 max 进度条形态：`100 / 1000 元`）；`StateValueField` 数值编辑控件右侧加灰色单位提示。

**LLM 提示**：`combined-state-updater.js#buildFieldsDesc` 状态更新提示词在 number 字段 `unit` 非空时追加「单位：xxx（仅展示用途，写入值仍为纯数字）」，避免 LLM 把单位写进数值。同时 `memory/recall.js` 三个 `render*State` 函数（注入 [6] 状态段）的 `rowsToStateText` 在 number 字段渲染时拼接 ` ${unit}`，让正文生成路径也能感知单位（避免 UI 显示「100 元」但 LLM 仍按裸数字 100 生成的尺度错位）。空 `unit` 时不输出该后缀，保持现有提示词缓存前缀稳定。

**导入导出**：`exportWorld` / `importWorldCard` SELECT 与 INSERT 加 `unit` 字段；`import-export-validation.js` 加 `assertOptionalString(field.unit, ..., 16)`。旧卡缺 `unit` 字段时按 `''` 兜底。

**未改 LLM/条件比较**：`unit` 不参与条件求值，也不会包进 LLM 写入的 patch（与 `prefix` 一致）。

---

## 2026-05-09 fix(turn-dialogue): 修复 think 内含 <next_prompt> 字面字符串时整段 think 块被吞

**现象**：writing 会话用 DeepSeek thinking 模型生成时，流式期间前端能看到 ThinkBlock + 正文，SSE done 后 ThinkBlock 消失只剩正文。

**根因**：`extractNextPromptOptions`（`backend/utils/turn-dialogue.js:96`）的"防止 think 内 next_prompt 残留"分支错误剥光整个 think 块。当模型在 `<think>` 推理中复述了 shared-suggestion.md 的 `<next_prompt>` 格式指令但本轮正文未真的输出选项时，`stripped.indexOf('<next_prompt>') === -1` 但 `text.includes('<next_prompt>') === true` 命中分支返回 `stripped`（去 think 后的文本），落库后 think 标签丢失，前端 `parseStreamingBlocks` 重渲染时找不到 think。

**修复**：该分支直接返回 `{ content: text, options: [] }` 保留 think 块原样。think 内的 `<next_prompt>` 字面字符串：历史回灌前 `stripThinkBlocksFromText` 会剥除 think；前端 `ThinkBlock` 用 `stripNextPromptBlocks`（`frontend/src/utils/next-prompt.js`）屏蔽字面标签。两个出口都不会泄漏，无需代价整段剥光。

**测试**：`backend/tests/utils/turn-dialogue.test.js` 新增两条用例覆盖（think 内 next_prompt 字面 / think 块外合法 next_prompt 共存）。

---

## 2026-05-09 fix(title): 标题生成尊重用户思考链配置，修复 DeepSeek thinking 内容写入标题

**背景**：DeepSeek v4 flash 等默认开启思考的模型，用户在设置中已配置 `thinking_disabled`，但 `generateTitleWithRetry` 硬编码 `thinking_level: null`（不传参），导致：
1. 模型默认开启思考，响应 `reasoning_content` 有内容、`content` 为空 → "生成失败"
2. 此前错误修复用 `unwrapSoloThinkBlock` 提取推理过程作为标题，推理内容被截断写入标题栏

**修复**：移除 `backend/memory/title-generation.js` `generateTitleWithRetry` 中的 `thinking_level: null` 硬编码，让调用方 scope 配置的思考级别（用户设置的 `thinking_disabled`）正常生效。DeepSeek 将按 `thinking: {type: "disabled"}` 发送，避免思考。

---

## 2026-05-09 feat(settings): 副模型支持独立思考链级别配置

**变更**：
- `backend/services/config.js`：`DEFAULT_AUX_LLM` 新增 `thinking_level: null` 字段；`getAuxLlmConfig` / `getWritingAuxLlmConfig` 透传 `thinking_level`
- `backend/llm/index.js`：aux / writing-aux scope 改用自身的 `thinking_level`（原来统一回退主模型）
- `frontend/src/components/settings/AuxLlmBlock.jsx`：新增 `onThinkingLevelChange` prop，复用 `getProviderThinkingOptions` 渲染与主模型相同的思考链选择器
- `frontend/src/components/settings/LlmConfigPanel.jsx`：对话副模型与写作副模型均传入 `onThinkingLevelChange` 回调

**行为**：副模型未配置 `thinking_level`（null）时，`getAuxLlmConfig` 回退主模型时会继承其 `thinking_level`；副模型独立配置后使用自身值。

## 2026-05-09 feat(ui): 美化「已中断」徽章样式

**变更**：
- `frontend/src/styles/tokens.css`：新增 `--we-color-warning-bg`（amber 8% 透明叠加），用于中断徽章底色
- `frontend/src/styles/chat.css`：`.we-message-interrupted` 升级为精致徽章风格
  - `border: 1px solid` → `box-shadow: 0 0 0 1px`（匹配项目环形阴影设计语言）
  - 新增 `background: var(--we-color-warning-bg)`（浅琥珀底色）
  - 字号 9px → 10px，间距 `1px 5px` → `2px 6px`
  - 颜色从废弃的 `--we-color-status-warning` 迁移到 `--we-color-status-warning`
  - 去掉 `opacity: 0.7`（颜色透明度已由 token 本身控制）

## 2026-05-09 fix(llm): DeepSeek 全量 think 包裹导致消息丢失的修复

**背景**：DeepSeek 开启 thinking 时，偶发将正文（含 `<next_prompt>`）也写入 `reasoning_content` 而非 `content`，导致 streaming 层输出 `<think>全部内容</think>`。`extractNextPromptOptions` 剥除 think 块后内容为空，消息未持久化，会话历史中断。

**修复**：
- `backend/utils/turn-dialogue.js`：新增导出函数 `unwrapSoloThinkBlock(text)`——若文本完全被单个 `<think>...</think>` 包裹（外侧无实际内容），提取并返回内部文本，否则原样返回。
- `backend/services/chat.js` `processStreamOutput`：在入口对 `rawContent` 调用 `unwrapSoloThinkBlock`，确保 DeepSeek 异常输出能正常持久化。

**已知限制**：streaming 阶段（`</think>` 前），前端仍会显示 think 面板；`done` 事件到达后前端用已正确保存的消息替换展示，视觉短暂异常但数据正确。若模型将 CoT 推理混入正文，CoT 内容也会一并写入助手消息。

**测试**：新增 3 个后端测试覆盖解包路径（全量包裹无 next_prompt、含 next_prompt、正常混合不解包）。

---

## 2026-05-09 fix(prompts): XML 注入修复——转义 char_info 内容与 char_state name 属性

**变更**：`backend/prompts/assembler.js` 新增 `escapeXmlContent` / `escapeXmlAttr` 辅助函数。
- P1：`character.system_prompt` 插入 `<char_info>` 前先经 `escapeXmlContent` 转义，防止用户提示词中包含 `</char_info>` 等标签提前关闭 XML 块。
- P2：`character.name` 作为 `<char_state name="...">` 属性时先经 `escapeXmlAttr` 转义，防止角色名含 `"` / `<` / `&` 导致属性格式错误。

---

## 2026-05-09 refactor(prompts): 全段 XML 标签包裹，提升结构清晰度，减少身份漂移

**变更**：`buildPrompt` / `buildWritingPrompt` 中所有"参考数据块"统一用 XML 标签包裹；渲染函数内的中文方括号节头同步清除（已由 XML 标签语义覆盖）。

- `[2]` 世界知识条目（always-on & 触发） → `<world_entries>`
- `[3]` 玩家人设 → `<user_info>`（原内部节头 `[{{user}}人设]` / `[玩家背景]` 删除）
- `[4]` 角色人设 → `<char_info>`（原内部节头 `[{{char}}人设]` 删除）
- `[5]` 世界状态 → `<world_state>`（`renderWorldState` 不再输出节头行）
- `[6]` 玩家状态 → `<user_state>`（`renderPersonaState` 不再输出节头行）
- `[7]` 角色状态 → `<char_state>`；写作模式多角色用 `name` 属性区分（`renderCharacterState` 不再输出节头行）
- `[8]` 触发条目 → `<world_entries>`
- `[8.5]` 长期记忆 → `<long_term_memory>`（原 `[长期记忆]` 前缀删除）
- `[9]` 召回摘要 → `<recalled_memories>`（`renderRecalledSummaries` 不再输出节头行）
- `[10]` 展开原文 → `<expanded_dialogues>`（`renderExpandedTurnRecords` 不再输出节头行）
- `[11]` 日记注入 → `<diary>`（原 `[日记注入]` 前缀删除）
- `[1]` 全局 System Prompt 不包裹（IS 指令根节点）

**原因**：LLM 有时把玩家/角色人设解读为自身身份（漂移）。XML 标签创造明确的知识块边界，Claude 对其语义理解优于纯文本节头。项目已有先例（`shared-suggestion.md` 的 `<suggestion>`）。

**修改文件**：`backend/prompts/assembler.js`（锁定文件）、`backend/memory/recall.js`、`backend/memory/summary-expander.js`；测试断言同步更新（3 个测试文件 + 1 个 snap 文件）。

## 2026-05-09 refactor(prompts): 后置提示词从独立 system message 合并入当前用户消息

**变更**：`buildPrompt` / `buildWritingPrompt` 中 [13] 后置提示词（`global_post_prompt`、`character.post_prompt`、兜底角色名、`SUGGESTION_PROMPT`）不再作为独立的 `role:system` 消息发送，改为追加到 [14] 当前用户消息末尾，合并为一条 `role:user`。附件消息（vision 数组格式）以额外 `type:text` part 追加。

**原因**：部分 provider 对 system 消息位置有限制，合并为 user 消息可提高兼容性，同时减少消息总数。

**影响**：历史消息之后不再有独立的 system 后置消息；`messages.length` 减少 1；ARCHITECTURE.md §4 表格已同步更新。

**续写路径（`buildContinuationMessages`）核查**：无需改动。续写时 rawMessages 末尾仍是 `role:user`（[13+14] 合并消息），三条分支（prefill、role≠user 守卫、主路径）行为均与改前等价；suggestion 在原始请求和续写指令中各出现一次，职责分开不冲突，与改前相同。

## 2026-05-09 refactor(prompts): cached layer 编号重排，[4] 常驻条目上移至 [2]

**变更**：`assembler.js` cached layer 顺序调整为 [1] 全局 → [2] 常驻条目 → [3] 玩家 → [4] 角色（原顺序 [1][2][3][4] = 全局/玩家/角色/常驻）。写作模式同步调整：cached layer 变为 [1][2][3]，dynamic 层角色提示词从 [3] 改为 [4]。仅代码位置和注释编号变化，功能不变。同步更新 `ARCHITECTURE.md` §4 表格与说明。

## 2026-05-09 feat(prompts): 删除写作模式叙述者身份声明

**变更**：移除 `backend/prompts/assembler.js` 中 `[NARRATOR]` 段——写作模式 dynamic 层最前的硬编码身份声明 `[写作模式]\n你是全知中立叙述者…` 已删除。

**影响**：写作模式不再自动注入固定叙述者人设；若需要叙述者身份设定，可在世界/全局的系统提示词中手动配置。

## 2026-05-08 fix(assistant/knowledge): 纠正写卡助手对 token 权重的认知错误

**问题**：助手在面板上回复"token 权重为 1（优先级最高）"，认知错误。`token` 是注入顺序权重，不是优先级；LLM 对 prompt 末尾内容 recency 更强，**靠后（token 数越大）实际优先级越高**，靠前（token 数越小）反而更容易被后续内容覆盖。

**修复**：`assistant/knowledge/WORLDCARD.md` 中 `token` 字段说明改写为"越小越靠前、越大越靠后；越靠后实际优先级越高"，并明令"回复用户时禁止把 token=1 描述为 优先级最高"。

**验证**：人工阅读知识文件；下一次让助手新增 always 常驻条目时，回复中不应再出现"token=1（优先级最高）"。

## 2026-05-08 fix(assistant): 修复 codex review 指出的两处回归

**背景**：上一次覆盖率改动引入两个 P2 回归，由 `/codex:review` 检出。

- `assistant/package.json`：`test:coverage` 的 `--test-coverage-include` 改用双引号包裹 glob。原单引号在 Windows `cmd.exe` 下不会被剥离，glob 字面传入会匹配不到任何文件，导致覆盖率统计在 Windows 下完全失效。
- `assistant/server/tools/apply-persona-card.js`：persona-card 的 `entityId` 在 create/update 中始终代表 worldId（与 `normalize-proposal.js` 语义一致）。原实现把 create 后的返回值改为 `result.id`（新 persona 主键），后续链式 update 会拿 personaId 当 worldId 查表导致失败。修复：始终回填 `args.entityId`，新 persona 主键单独放到 `personaId` 字段。

**验证**：`npm run -s test --prefix assistant` 全 115 个用例通过。

## 2026-05-08 test(coverage): assistant 单测覆盖率拉到 92%+

**背景**：上一轮覆盖率任务遗留 `assistant/` 自身覆盖率仅 46.58%；`parent-agent.js`/`routes.js`/`sub-agent.js`/`task-store.js`/`plan-doc.js` 等大文件覆盖率均偏低。本次专项补测把 assistant workspace 拉到 92.47% 行覆盖（≥ 80% 目标达成）。

**配置调整**
- `assistant/package.json`：
  - `test` glob 改为 `tests/**/*.test.{js,mjs}`，修复历史遗留——原 `*.test.js` 不匹配 `parent-agent.test.mjs` / `plan-doc.test.mjs`，导致它们从未被执行（隐藏问题）。
  - `test:coverage` 加 `--test-coverage-include='server/**'`，只统计 assistant 自身；不再把 import 进来的 backend/shared 代码记入 assistant 覆盖率。

**新增/扩充测试（5 → 13 文件，34 → 113 tests）**
- 新增 `tests/task-store.test.js`：CRUD + SSE 订阅/广播/失败客户端隔离/endAllSse 等全路径。
- 扩充 `tests/plan-doc.test.mjs`：补 `writePlanDoc/readPlanDoc/deletePlanDoc/ensurePlanDir`、空文档解析、completedAt 渲染。
- 扩充 `tests/parent-agent.test.mjs`：通过 `__testables` 覆盖 `wrapApply` 异常捕获、`buildContextBlock`、`buildMetaTools` 5 个工具的成功/失败/dispatch 分支；用 mock LLM 跑通 `runParentAgent` 的流式成功 / 流式抛错 / approved sentinel 三条路径。
- 新增 `tests/sub-agent.test.js`：`__testables` 三种 `toLLMTool` 形态、`resolveEntityRef`、`buildUserMessage`；`dispatchSubAgent` 走 mock LLM 的成功 / LLM 抛错 / tool 抛错 / emitFn 事件序列。
- 新增 `tests/normalize-proposal-extra.test.js`：补 `stateFieldOps` 表格类型校验（columns/min/max/重复 key/未声明列等 8 个分支）、`normalizeEntryOps` 校验全路径、`applyProposal` 的 world-card delete / character-card delete / persona-card create / state field update + delete / UNIQUE 冲突幂等 / 各种 entityId 缺失抛错。
- 新增 `tests/routes-http.test.js`：用 Express + `node:http` 装路由，覆盖 `/extract-characters` `/confirm-characters` `/agent` `/agent/:id/cancel|approve|truncate|delete|plan-doc` 全部端点 + SSE 收流。
- 新增 `tests/tools/apply-tools.test.js`：6 个 apply_* 工具的 create / update / delete 全路径（用 backend 测试沙盒里的真 SQLite + mock LLM），含 `apply_global_config` 的 api_key 剥离。
- 新增 `tests/tools/list-resources.test.js`：4 个 target、worldId 必填校验、>200 条截断。
- 新增 `tests/tools/project-reader.test.js`：路径越界拒绝、读真实文件、50KB 截断。

**结果**
- 113 tests 全绿；`assistant/server/**` 行覆盖 50.25% → **92.47%**：
  - `task-store.js` 33% → 100%
  - `plan-doc.js` 24% → 100%
  - `sub-agent.js` 35% → 100%
  - `parent-agent.js` 16% → 89.82%
  - `routes.js` 23% → 80.74%
  - `normalize-proposal.js` 60% → 93.22%
  - 6 个 `tools/apply-*.js` 均到 100%
  - `tools/list-resources.js` 57% → 100%

**修复了上一次列出的两个残留风险**
- 修：`apply_world_card` / `apply_character_card` / `apply_persona_card` / `apply_css_snippet` / `apply_regex_rule` 的 `entityId` 回填逻辑——原 `result.entityId ?? null` 与下游 service 返回的 `{id}` 字段名不一致，create 时永远回填为 null。改为 `result?.id ?? result?.entityId ?? args.entityId ?? null`，create 后正确回填新建实体 id；apply-tools 测试加 `assert.equal(created.entityId, db_row.id)` 防回归。
- 测：补 `runParentAgent` 在 Step 1（resolveToolContext）通过工具调用切到 `completed` / `awaiting_approval` 时的两条早返回分支：用 `MOCK_LLM_TOOL_CALLS` 注入 `finalize_task` / `write_plan_doc` 触发，断言 `delta` 不再发出、终态分支发 done、awaiting_approval 分支不发 done 保持长连接。`parent-agent.js` funcs 91.67% → **100%**，line 89.82% → **92.55%**。

**残留风险**
- assistant 测试沙盒共享 backend 的 `createTestSandbox`，启动时间对 list-resources 的 200 条截断测试约 65ms，可接受。

## 2026-05-08 test(coverage): 前后端单测覆盖率拉到 80%+

**背景**：基线前端 78.18%、后端 71.16%，多个薄弱模块仅有部分测试覆盖。本次集中补测使两端均超过 80% 行覆盖。

**新增/扩充前端单测（135 → 139）**
- 新增 `tests/api/long-term-memory.test.js`：覆盖读取/更新与 HTTP 错误。
- 扩充 `tests/api/worlds.test.js`：补 `reorderWorlds` / `uploadWorldCover`（含 body.error 优先级与 body 解析失败兜底）。
- 扩充 `tests/api/chat.test.js`：补 `editAssistantMessage` / `retitle` / `impersonate` / `stopGeneration` / `regenerate` 错误回调。
- 扩充 `tests/api/persona-state-values.test.js`：补 `*ByPersonaId` 系列与 `reset*` 兜底分支。
- 扩充 `tests/api/session-state-values.test.js`：补 `patchSessionStateValue` 三个 category 分支与失败错误。
- 扩充 `tests/api/character-state-values.test.js` / `world-state-values.test.js`：补 `.json()` 解析失败的状态码兜底。

**新增后端单测（≈45 个新用例）**
- `tests/routes/worlds.test.js`：覆盖 11 个 handler 的参数校验、404、reorder、cover 上传 400/404。
- `tests/routes/chat-extra.test.js`：补 `/chat`/`/regenerate`/`/continue`/`/edit-assistant`/`/retitle`/`/impersonate` 的参数校验、404、retitle 空标题、retitle LLM 抛错 500、impersonate 空 character/world 400。
- `tests/services/long-term-memory.test.js`：覆盖读写、append（含触发 compress、空内容跳过）、compress（剥 `<think>`、空返回、LLM 抛错被吞）、`restoreLtmFromTurnRecord` 三种分支。
- `tests/services/persona-state-fields.test.js`：create 初始化所有 persona、update 仅刷新未自定义、delete 级联删除、reorder 排序。
- `tests/utils/session-summary-vector-store.test.js`：loadStore 缺文件/损坏、deleteBySessionId 不写盘、search 各种过滤/topK/维度/零向量。
- `tests/utils/turn-dialogue.test.js` + `tests/utils/token-counter.test.js`：边界与 nullish 安全。

**配置调整**
- `backend/package.json`：`test:coverage` 增加 `--test-coverage-exclude="../assistant/**"` 与 `--test-coverage-exclude="tests/**"`。理由：assistant 是独立 workspace，有自己的 `npm run test:coverage`；后端覆盖率不应再把 assistant 代码计入。tests 目录自身为测试代码，无需被计入。

**结果**
- 前端：47 → 48 files、116 → 139 tests 全绿；`All files` 行覆盖 78.18% → **80.25%**。
- 后端：314 → 359 tests 全绿（3 skip）；`all files` 行覆盖（已排除 assistant）71.16% → **81.16%**。
- 已知未达成：`assistant/` 自身覆盖率仍为 46.58%（落在另一 workspace 的 `npm run test:coverage:assistant`），其 `parent-agent.js`/`routes.js`/`normalize-proposal.js` 等大文件需要专门的 LLM mock 与 plan-doc fixture，本轮未触及。

**残留风险**
- `routes/worlds.js` 的 cover 上传成功路径（`updateWorld(cover_path)`）未测：multer 在 Express 5 + Node 25 自带 `fetch`+`FormData` 上传时，req.file 在我们的服务器入口下未被填充（隔离环境可复现）。改为只测 400/404 分支，cover_path 写库由 `updateWorld` 的现有测试间接覆盖。
- `chat.js` 流式生成主循环（`runStream`）仍由 `chat.test.js` 既有 SSE 测试覆盖，本次未深入流内分支。

## 2026-05-08 fix(tests): 修复前端 15 个历史遗留测试 failures

**背景**：上一次修复后剩余的 15 个前端测试失败均为生产代码已演化但测试未同步，全部是测试侧问题。

**修复（116 tests, 0 failures）**
- `tests/assistant/api.test.js`：旧 `chatAssistant`/`executeProposal` API 已被 `streamAgent`/`approveTask` 替换；改写为单 `onEvent` 回调断言事件序列，并断言 `approveTask` 命中 `/api/assistant/agent/:id/approve`
- `tests/api/config.test.js`：移除已删除的 `updateApiKey`/`updateAuxApiKey`/`updateEmbeddingApiKey`/`updateWritingApiKey`，改测唯一的 `updateProviderKey(provider, key)` 命中 `/api/config/provider-key`
- `tests/hooks/use-settings-config.test.jsx`：mock 与断言全部从分散的 `update*ApiKey` 收敛到 `updateProviderKey`
- `tests/pages/settings-page.test.jsx`：overlay 关闭从 `click` 改为 `mouseDown`+`mouseUp`（生产代码使用按下/抬起一致性判定）
- `tests/pages/world-edit-page.test.jsx`：`WorldEditPage` 不再在页内编辑默认状态值，移除 save-weather 交互与 `updateWorldStateValue` 断言
- `tests/pages/persona-edit-page.test.jsx`：补 `updatePersonaStateValueByPersonaId`/`getPersonaStateValuesByPersonaId` mock；状态值保存断言改为 `(worldId, personaId, fieldKey, valueJson)` 四参数
- `tests/components/state/EntryEditor.test.jsx`：作用域/字段已拆为两个 Select；先选 `世界` 再选 `温度`，option 文本断言对应去掉 scope 前缀
- `tests/components/state/EntrySection.test.jsx`：`-u` 重新生成快照，纳入新增的禁用切换按钮
- `tests/pages/chat-page.test.jsx`：`InputBox` 不再暴露 `onClear`，移除清空消息交互与对应 `confirm` 断言

**验证**：`cd frontend && npx vitest run` → 47 files / 116 tests 全绿；`npm run lint` 通过。

## 2026-05-08 fix(tests): 修复前后端测试套件，消除 lint 错误

**背景**：`npm run check` 跑出 10 个 ESLint 错误 + 7 个后端测试失败，均为前几次功能迭代遗留。

**前端 ESLint 修复（0 errors，4 warnings 均为已知 warn-only）**
- `frontend/eslint.config.js`：安装 `eslint-plugin-react`，添加 `react/jsx-uses-vars` 规则，消除 `<motion.X>` 引用对象被误报未使用的假阳性
- `GlobalToast.jsx`：删除真正未使用的 `variants` import
- `StateFieldEditor.jsx`：删除未使用的 `mouseDownOnBackdrop` ref；将 `lockedColumnKeys` 从 `useRef` 改为 `useState` 初始化函数（修复渲染期 ref.current 访问）
- `LongTermMemoryModal.jsx`：将同步 `setLoading/setError` 移到 Promise 回调，修复 effect 同步 setState 警告
- `CastPanel.jsx`：同上，`setWorldName(null)` 移至 Promise 链，消除同步 setState
- `WorldConfigPage.jsx`：`refresh` 改为 `useCallback`，修复 `exhaustive-deps` 警告

**后端测试修复（301 tests, 0 failures）**
- `state-values.test.js`：persona 套件 `createOwner` 加入 `insertPersona`，使 `upsertPersonaStateValue` 能找到 active persona
- `state-values-extra.test.js`：`resetPersonaStateValuesValidated` 测试在 `insertPersonaStateValue` 前先创建 persona
- `assembler.test.js`：`messages.length 2→3`（identity drift 兜底消息总在 [13]）；`maxTokens 777→577`（写作建议保留 200 token）；`next_prompt` 断言改到 messages[3]/messages[1] 而非末尾 user 消息；`char` 占位符在写作 global prompt 改为 `叙述者`
- `assembler-shape.test.js` + `assembler-shape.snap`：`next_prompt` 锚点从 user 消息（index 4）移到 post-system（index 3）；snapshot `maxTokens 444→500`（suggestion 预留后的最低保证值）
- `writing.test.js`：删除已被 `refactor: 移除写作会话的 clearMessages API` 移除的 DELETE messages 路由相关断言

**坑点**：前端 15 个测试失败为历史遗留（git stash 验证），与本次修改无关。

## 2026-05-08 feat(entries): 状态条件 datetime 字段改为部分选择模式

**背景**：datetime 类型状态字段的条件值原来是 5 段 ISO 输入框（YYYY-MM-DD T HH:MM），需要填写完整时间才能判断，无法只对"年份"或"月份"单独比较。

**改动**
- `frontend/src/components/state/DatetimePartInput.jsx`（新增）：下拉选年/月/日/时/分 + 单个数字输入框，value 格式为 `"year:2024"`、`"month:3"` 等。
- `frontend/src/components/state/EntryEditor.jsx`：条件行的 datetime 字段从 `DatetimeSplitInput` 换为 `DatetimePartInput`。
- `frontend/src/styles/ui.css`：新增 `.we-datetime-part-input` flex 容器样式。
- `backend/prompts/entry-matcher.js`：`evaluateCondition` 新增对 `"part:number"` 格式的识别，提取 datetime 状态值中对应段位后做数值比较；旧的全量 ISO 比较作为兼容路径保留。

**不变**：`DatetimeSplitInput` 保留供状态值编辑器（StatusSection 等）使用；entry_conditions 表结构无变化，value 字段改存 part 格式字符串。

## 2026-05-08 feat(entries): 状态条件字段选择器拆分为 2-3 级联下拉

**背景**：原来的状态条件下拉把所有字段平铺成"世界.时间""角色.xxx""玩家.xxx.col"，用户很难快速找到目标字段。

**改动**
- `frontend/src/components/state/EntryEditor.jsx`：
  - `emptyCondition()` 新增 `scope / field_label / col_key` 三个子字段
  - 新增 `parseTargetField(tf)` 将已有 `target_field` 反解为三个子字段（用于回填编辑）
  - 新增 `SCOPE_OPTIONS / getFieldOptions / getColOptions` 三个辅助函数
  - 用 `rawFieldsByScope`（按范围分组的字段对象）替换原有平铺 `fieldOptions`
  - `updateCondition` 处理级联清空：切换范围→清空字段和列，切换字段→清空列，并重组 `target_field`
  - 渲染层：单个 Select 换成 2-3 级联 Select（第三级仅 table 类型时出现）
- `frontend/src/styles/ui.css`：`.we-entry-condition-field` 改为 flex 容器（含 gap + `min-width: 60px` 约束），兼容 2-3 个下拉横排

**不变**：`target_field` 存储格式（"世界.时间" / "世界.属性.atk"）不变，后端零改动

## 2026-05-08 feat(state): 新增 type='table' 状态字段（2 行 N 列）

**背景**：状态字段此前仅支持 6 种原子类型；本次需要"一组同结构的并列数值"的紧凑表达（六维属性、攻防速等）。新增 `type='table'`：第 1 行表头 + 第 2 行数值，列数固定，仅支持数值列，每列可选独立上下限；条件条目可定位到具体一列。

**改动**
- `backend/db/schema.js`：三张 state_fields 表 CREATE 加 `table_columns TEXT`；`initSchema` 末尾追加 ALTER 迁移。
- `backend/db/queries/_state-fields-base.js`：`parseRow` 自动 JSON.parse `table_columns`。
- `backend/db/queries/{world,character,persona}-state-fields.js`：INSERT/UPDATE 加 `table_columns` 列，序列化为 JSON 字符串。
- `backend/db/queries/session-state-values.js`：三个 SELECT 加 `table_columns` 字段，方便前端渲染与条件评估识别 type。
- `backend/memory/combined-state-updater.js`：`validateValue` 增 `case 'table'`（按列裁剪 + 数值校验）；`buildFieldsDesc` 输出列结构与上下限给 LLM。
- `backend/memory/recall.js`：`parseValueForDisplay` 处理对象值，渲染为 `key=val,...`。
- `backend/prompts/entry-matcher.js`：抽出 `setStateMapRow()`，`type='table'` 字段按列展开 `scope.label.column_key` 写入 stateMap，三段 target_field 自动命中。
- `assistant/server/normalize-proposal.js`：`VALID_STATE_TYPES` 加 `'table'`；`STATE_FIELD_KEYS` 加 `'table_columns'`；create/update 路径新增 `normalizeTableColumns` + `assertTableDefaultValue`，禁止与 enum_options/min_value/max_value/prefix 同时使用。
- `assistant/knowledge/{WORLDCARD,CHARCARD,USERCARD}.md`：补 table 类型 type 表行、default_value 写法、value_json 写法、CRUD 示例和列条件 target_field 说明。
- `frontend/src/components/state/StateFieldEditor.jsx`：TYPE_OPTIONS 加 `table`；新增列编辑器（key/label/min/max/默认值），handleSave 序列化 `table_columns` 与对象 default_value。
- `frontend/src/components/book/StatusTable.jsx`（新建）：2 行 N 列 grid 渲染，每列可选进度条；单元格点击进入 `CellEditor` 编辑数值。
- `frontend/src/components/book/StatusSection.jsx`：在 row 渲染分支加 `type === 'table'` 处理，调用 StatusTable + commit 整行对象 JSON。
- `frontend/src/components/index.js`：注册 StatusTable。
- `frontend/src/index.css`：新增 `.we-status-table` / `.we-status-table-row` / `.we-status-table-cell` / `.we-status-table-head-cell` 等样式块（沿用当前文本语义 token 与 `.we-status-bar` 风格）。
- `frontend/src/components/state/EntryEditor.jsx`：fieldOptions 加载时把 `type='table'` 字段展开为每列虚拟选项，target_field 写入 `scope.label.column_key` 三段格式；getOpsForField 对列字段返回数值操作符。
- `backend/services/import-export.js`：三套 state_fields 的 SELECT/INSERT 加 `table_columns`，导入导出经 JSON parse/stringify 来回。
- `backend/services/import-export-validation.js`：`assertStateFields` 校验 `table_columns` 为数组（若提供）。
- `SCHEMA.md`：三张 state_fields 表 type 枚举加 `'table'`，新增 `table_columns` 字段行；`entry_conditions.target_field` 行新增三段语法说明，下方说明追加 table 列定位规则。
- `ARCHITECTURE.md` §8：状态系统的字段类型列表追加 `datetime` 与 `table`，并补 entry-matcher 的列展开行为。

**关键约束**
- 仅支持数值列；缺列保持缺省；`enum_options / min_value / max_value / prefix` 与 `table_columns` 互斥。
- 条件 target_field 三段格式 `scope.field_label.column_key`，仅参与数值操作符；列缺失或值非有限数 → 跳过该条件（与既有数值跳过策略一致）。
- 不保留向后兼容；旧库由 `initSchema` 末尾的 ALTER 自动补列。

**验证**
1. 重启 backend/frontend 后，世界编辑页新增 `type='table'` 字段（列 atk/def/spd，默认 30/20/15，每列上限 99）。
2. 进入会话页确认右侧状态栏渲染 2 行 N 列表格，进度条与点击编辑生效；写作模式同步验证。
3. 创建 `trigger_type='state'` 条目，条件选 `角色.三围.atk > 50`，断言命中切换正确。
4. 写卡助手对话："给主角加一个表格状态'三围'，列攻防速，默认 30/20/15"，断言提案通过 normalize 校验并落库。
5. 导出 .weworld.json → 重置数据库 → 导入 → 表格字段与值完整恢复。

## 2026-05-08 feat(entries): 状态条件 AND/OR 模式切换

**背景**：编辑 state 类型条目时，状态条件仅支持 AND 逻辑（全部满足才触发）。用户需要支持 OR 模式（任一满足即触发），每个条目统一一种模式，默认 AND。

**改动**
- `backend/db/schema.js`：`world_prompt_entries` 建表语句新增 `condition_logic TEXT NOT NULL DEFAULT 'AND'`；`initSchema` 末尾追加 ALTER TABLE 迁移，兼容现有库。
- `backend/db/queries/prompt-entries.js`：`createWorldEntry` INSERT 加入 `condition_logic`；`updateWorldEntry` 的 allowed 字段列表加入 `condition_logic`。
- `backend/prompts/entry-matcher.js`：state 条件评估改用 `entry.condition_logic === 'OR' ? 'some' : 'every'` 动态切换，writing 模式和 chat 模式均已更新。
- `frontend/src/components/state/EntryEditor.jsx`：`form` state 加入 `condition_logic`；保存时透传；状态条件区块标签行右侧加 AND/OR pill 切换按钮组，标签文字随模式动态变化。
- `frontend/src/styles/ui.css`：新增 `.we-entry-condition-logic-row`、`.we-entry-condition-logic-toggle`、`.we-entry-condition-logic-btn`（含 `.active`）样式。
- `SCHEMA.md`：`world_prompt_entries` 字段表新增 `condition_logic` 行；`entry_conditions` 说明更新。

## 2026-05-08 fix(import-export): 世界导出/导入保留 prompt_entries.enabled 状态

**背景**：Codex review 发现 exportWorld 的 SELECT 未包含 `enabled`，importWorld 的 INSERT 也未写入，导致禁用条目经 `.weworld.json` 圆形回路后被静默重置为启用。

**改动**
- `backend/services/import-export.js`：`exportWorld` SELECT 加 `enabled`；`importWorld` INSERT 列表加 `enabled`；`insertPromptEntries` 辅助函数传参加 `entry.enabled ?? 1`。

**验证**：禁用若干条目 → 导出世界 → 删除世界 → 导入 → 确认原本禁用的条目仍为禁用。

## 2026-05-08 feat(entries): 条目启用/禁用开关

**改动**
- `backend/db/schema.js`：`initSchema` 末尾追加 `ALTER TABLE world_prompt_entries ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1` 迁移。
- `backend/db/queries/prompt-entries.js`：`updateWorldEntry` 的 allowed 字段列表加入 `enabled`。
- `backend/prompts/assembler.js`：`getAllWorldEntries` 结果在对话模式和写作模式两处均追加 `.filter((e) => e.enabled !== 0)`，禁用条目不注入提示词。
- `frontend/src/components/state/EntrySection.jsx`：每行加小开关，点击乐观更新本地状态，调 `updateWorldEntry` 写库，失败时回滚；禁用行加 `we-entry-section-row--disabled`（整体 opacity 降低）。
- `frontend/src/styles/pages.css`：新增 `.we-entry-section-toggle`、`.we-entry-section-toggle--off`、`.we-entry-section-toggle-thumb`、`.we-entry-section-row--disabled` 样式，开关宽 28px × 高 16px，嵌入现有行内不占额外空间。

**验证**：进入世界编辑页 → 任意条目列 → 点击开关变灰/变亮，刷新后状态持久；在聊天中发送消息，确认禁用条目不出现在提示词（可开 `logging.mode=raw` 验证）。

## 2026-05-08 fix(assistant): verbose 工具间隙期持续显示打字动画，消除静默断档

**背景**：工具调用完成（绿勾）后、LLM 推理或下一个工具启动前，存在一段"静默间隙"：`pendingAssistant` 仅在最后一条消息为 `user` 时为 true，工具完成后立即变 false，`PendingBubble`（打字动画）消失，面板冻结在最后一个绿勾状态，用户无法判断任务是否仍在运行。

**改动**
- `assistant/client/AssistantPanel.jsx`：将 `pendingAssistant` 的计算逻辑从「最后一条是 user 消息」改为「任务处于 planning/executing/paused 状态，且当前无任何消息处于 running 或 streaming」，移除冗余的 `lastMsg` 变量。

**行为变化**：工具完成 → 打字动画接替 → 下个工具 spinner 接替 → 流式输出光标接替，全程无静默断档。

**验证**：打开写卡助手，发送需要多工具调用的请求，观察每个工具完成后均立即出现打字动画，直到下一个 spinner 或流式输出出现。

**同步文档**：`CHANGELOG.md`（本条）。

## 2026-05-07 fix(assistant): 移除无效 flushSync + 限制失败行复用范围至当前任务

**背景**：Codex Review 发现上次提交的两处 P2 问题：
1. `flushSync` 包装 `tool_call_started` 回调无法让浏览器绘制中间帧（同一 JS 任务内无法 paint），该用法无效且误导人。
2. `tool_call_started` 的失败行复用逻辑按 toolName 扫描全部 `messages`，面板保留跨任务历史时，新任务的同名工具调用会覆盖旧任务的失败记录，污染历史日志。

**改动**
- `assistant/client/AssistantPanel.jsx`：移除 `flushSync` import 及 `handleEvent` useCallback，`streamAgent` 直接接收 `ingestEvent`。
- `assistant/client/useAssistantStore.js`：新增 `taskMsgOffset: 0` 字段；`task_created` 事件时记录 `s.messages.length` 作为偏移；`tool_call_started` 只在 `taskMsgOffset` 之后搜索失败行，防止跨任务覆盖。

**验证**：触发写卡任务 → verbose 列表行为不变（`running` → `done`/`error`）；多个连续任务使用同名工具时，各任务的失败记录独立保留，不互相覆盖。

**同步文档**：`CHANGELOG.md`（本条）。

## 2026-05-07 fix(assistant): verbose 进行中图标可见 + 重试后不再常驻失败标记

**背景**：两个 verbose 显示问题：
1. 工具调用的 running spinner 因 React 18 自动批处理被跳过：`tool_call_started` 和 `tool_call_completed` 在同一 SSE chunk 内同步处理，两次 Zustand `set()` 被合并成一次渲染，导致 `status: running` 的旋转图标从未出现。
2. 工具重试成功后，原失败条目仍以红色 ✗ 常驻：每次重试生成新 callId，旧的 `status: error` 条目不会更新。

**改动**
- `assistant/client/AssistantPanel.jsx`：引入 `flushSync` 包装 `onEvent` 回调；`tool_call_started` / `step_started` 事件强制同步渲染，保证 running 状态可见。
- `assistant/client/useAssistantStore.js`：`tool_call_started` case 先扫描 `messages` 中同名工具的最近失败条目；若找到，复用该条目槽位（替换 id 并重置为 `status: running`），而非追加新条目，从而使重试成功后条目更新为 ✓。

**验证**：触发写卡任务 → 观察 verbose 列表中执行中的条目出现旋转图标；模拟工具失败并重试后，该条目最终显示 ✓ 而非 ✗。

**同步文档**：`CHANGELOG.md`（本条）。

## 2026-05-07 fix(assistant): messages_changed 不再丢弃合成 plan_doc 行

**背景**：`plan_doc_updated` 把计划文档注入 `messages` 数组（role `plan_doc`，id `'plan-doc'`）。但 truncate / delete 操作广播 `messages_changed` 时，服务端只返回真实消息列表，不含合成行，导致 store 直接替换 `messages` 后计划文档从 UI 永久消失。

**改动**
- `assistant/client/useAssistantStore.js`：`messages_changed` 处理器在替换数组前，检查当前 `messages` 中是否有 `role === 'plan_doc'` 的合成行；若有，以原索引（上限 clamp 到新数组长度）重新插入，保证计划文档在任何编辑 / 删除操作后仍然可见。

**验证**：触发写卡任务生成计划文档 → 删除某条消息 → 确认计划文档仍然显示；截断消息后同样保留。

**同步文档**：`CHANGELOG.md`（本条）。

**锁定文件**：未触碰。

**残留风险**：无。

---

## 2026-05-07 fix(assistant): 计划文档嵌入会话流 + 重开面板保留消息历史

**背景**：两个独立问题。① 计划文档（PlanDocViewer）作为独立 prop 渲染在 MessageList 末尾，不进入 `messages` 数组，导致 auto-scroll 不触发、卡片视觉上"悬浮"于会话之上。② 写卡助手面板关闭后再打开，若上一个任务处于终态（completed / failed / cancelled），会调用 `reset()` 清空消息历史，导致对话记录丢失。

**改动**
- `assistant/client/useAssistantStore.js`：
  - `plan_doc_updated` 事件处理：除更新 `planDoc` 状态外，同步将计划文档注入 `messages` 数组（role `plan_doc`，id 固定为 `'plan-doc'`）。首次注入 append，后续更新 in-place map，不改变消息条数，不触发多余 auto-scroll。
  - 新增 `resetTask()`：仅重置任务态字段（`taskId / status / planDoc / error / currentStepId`），保留 `messages` 历史，专用于面板重开场景。
- `assistant/client/MessageList.jsx`：
  - 渲染循环新增 `role === 'plan_doc'` 分支，直接渲染 `<PlanDocViewer>`。
  - 移除末尾独立的 `{planDoc && <PlanDocViewer content={planDoc} />}` 和 `planDoc` prop，计划文档改由消息数组驱动。
- `assistant/client/AssistantPanel.jsx`：
  - 面板重开时改用 `resetTask()` 替换原 `reset()`，输入框解锁同时保留消息历史。
  - `MessageList` 调用移除 `planDoc` prop。

**效果**
- 计划文档首次出现时触发 auto-scroll（`messages.length` 增加），随会话流自然滚动，不再悬浮。
- 后续计划文档更新（步骤勾选、日志追加）仅更新消息内容，不触发额外滚动。
- 关闭面板再打开后，消息历史完整保留，手动点"清空"才真正清空。

**验证**：触发写卡任务，确认计划文档出现在用户消息气泡正下方并随滚动条移动；关闭面板再打开，历史消息仍在；点"清空"后消息消失。

**同步文档**：`CHANGELOG.md`（本条）。

**锁定文件**：未触碰。

**残留风险**：`planDoc` 状态字段仍保留（用于"清空"按钮条件判断），未做清理；如后续不需要可移除。

---

## 2026-05-07 feat(assistant): verbose 显示美化 — 便签分组 + SVG 状态图标 + 复制按钮内嵌

**背景**：写卡助手的 step / tool_call 消息原先是逐条平铺、无视觉容器的文本行，状态用原始 ✓/✗ 字符，复制按钮孤立于气泡下方。整体观感与主界面风格脱节。

**改动**
- `assistant/client/MessageList.jsx`：
  - 新增 `groupMessages()`：render 阶段扫描 messages 数组，将相邻 step / tool_call 条目动态收入同一 `StepGroup` 容器（纯展示层分组，不缓冲数据，实时性不变）。
  - 新增 `StepGroup`：左侧 2px 竖线按状态着色（运行中=朱砂 `--we-color-accent`；全部完成=苔绿 `--we-color-status-success`；有失败=朱砂 `--we-color-status-danger`），完成后背景切换为 canvas、透明度 0.72 表示"已归档"。
  - 新增 `CheckIcon` / `ErrorIcon` inline SVG：替换原 ✓/✗ 文本字符，使用语义 token 着色（`--we-color-status-success` / `--we-color-status-danger` 填充，`--we-color-text-inverse` 描边）。
  - `StatusIcon`：三态 spinner / CheckIcon / ErrorIcon，均带 `aria-label`。
  - `StepItem`：12px，运行中 font-medium，完成后 text-tertiary，失败朱砂。
  - `ToolCallItem`：10px monospace，`pl-5` 缩进作为二级步骤，样式层次与 StepItem 区分。
  - `AssistantMessage`：复制按钮移入气泡底部，`opacity-0 group-hover:opacity-100` 悬停显示；重新生成 / 删除保留在气泡外 ActionBar；气泡 border / bg 改用语义 token（`--we-color-border-subtle` / `--we-color-bg-surface`）。
- `frontend/src/styles/chat.css`：新增 `.we-step-group` 系列规则（background / border-color / transition / archived 淡化），全部引用 `--we-*` 语义 token，无裸 hex / rgba。

**实时性保证**：step/tool_call 分组在 render 阶段计算，每条 SSE 事件到达立即触发 store set → re-render → 组内条目实时增长，无批处理或 debounce。

**验证**：启动前端 dev server，触发写卡任务，确认步骤逐条出现（竖线朱砂）→ 完成（竖线变苔绿、组淡化）→ 结果气泡悬停显示复制按钮。

**同步文档**：`CHANGELOG.md`（本条）。

**锁定文件**：未触碰。

**残留风险**：`PlanDocViewer` / `PendingBubble` / `ErrorMessage` 仍使用 `--we-color-bg-surface` / `--we-color-accent` 等旧别名 token（token 仍有效，仅为待迁移技术债），不在本次改动范围内。

---

## 2026-05-07 fix(assistant): 任务终态后 SSE 连接未关闭导致 isStreaming 卡死

**问题**：经过 `awaiting_approval → /approve → finalize_task` 路径时，原始 `/agent` SSE 连接被 `longLived=true` 保留。`/approve` 以 fire-and-forget 调用 `runParentAgent`，`finalize_task` 触发终态事件后无任何位置主动 `res.end()`。前端 `streamAgent` 的 `reader.read()` 永远不返回 `done:true`，导致 `isStreaming` 卡在 `true`，用户看到"停止"按钮无法正常交互。同类隐患：执行期间队列消息建立的新连接、取消时旧连接均同样泄漏。

**改动**
- `assistant/server/task-store.js`：新增 `endAllSse(taskId)`，关闭并清除该 task 所有 SSE 客户端（`clients.clear()` 而不删 Map entry，确保后续 `detachSse` 无副作用）。
- `assistant/server/parent-agent.js`：在 TERMINAL_AFTER_TOOLS 分支（`done` emit 后）和 catch 错误路径（`done` emit 后）各调一次 `endAllSse`。
- `assistant/server/routes.js`：`/cancel` 路由补 `done` 事件 + `endAllSse`，覆盖非前端触发取消的场景。

**验证**：`node --test assistant/tests/routes.test.js` 20/20；路由层 `res.writableEnded` 守卫确保双关安全。

## 2026-05-07 fix(db): persona_state_values 按 persona 拆分，每张玩家卡持有独立状态值行

**问题**：上一次修复（`clearPersonaStateValues`）是临时补丁——同一 world 下的多张玩家卡仍共用一份状态值行，切换 persona 会清除另一张卡的值。

**改动**
- `backend/db/schema.js`：新增 `migratePersonaStateValuesPerPersona(db)` 迁移函数；`persona_state_values` 表结构加 `persona_id TEXT NOT NULL REFERENCES personas(id) ON DELETE CASCADE`，UNIQUE 键从 `(world_id, field_key)` 改为 `(persona_id, field_key)`（`world_id` 保留用于级联/批量删除查询）。迁移时将旧行挂到该 world 的 active_persona 或最早创建的 persona。
- `backend/db/queries/persona-state-values.js`：全面重写。新增 `upsertPersonaStateValueByPersonaId(personaId, worldId, ...)` 供直接指定 personaId 的场景；`upsertPersonaStateValue(worldId, ...)` 等其余函数内部通过 `resolveActivePersonaId` 自动解析；删除 `clearPersonaStateValues`（临时补丁）；新增 `deletePersonaStateValuesByFieldKey(worldId, fieldKey)` 跨 persona 删除。
- `backend/services/persona-state-fields.js`：`createPersonaStateField` 改为为该 world 所有 persona 各 upsert 一行；`updatePersonaStateField` 同理；`deletePersonaStateField` 改用 `deletePersonaStateValuesByFieldKey` 全量删除。
- `backend/services/worlds.js`：`createWorld` 捕获 `upsertPersona` 返回值，用 `persona.id` 调用 `upsertPersonaStateValueByPersonaId`。
- `backend/memory/recall.js`：`renderPersonaState` 内联解析 `active_persona_id`，JOIN 条件从 `psv.world_id` 改为 `psv.persona_id = ?`。
- `assistant/server/normalize-proposal.js`：`persona-card create` 分支：删除 `clearPersonaStateValues` 调用（临时补丁），改在 `createPersonaDb` 后立即调用 `setActivePersona(worldId, newPersona.id)`，使 stateValueOps 写入新卡独立行。
- `assistant/knowledge/USERCARD.md`：回滚"自动清空旧卡"措辞，改为"新卡拥有独立状态值行"。
- `SCHEMA.md`：更新 `persona_state_values` 表结构说明。
- `backend/tests/helpers/fixtures.js`：`insertPersonaStateValue` 改为解析 active persona 并写入 `persona_id`。

**验证**：`npm test`（assistant 目录）32/32 通过。

**锁定文件**：`backend/db/schema.js`（迁移函数）、`SCHEMA.md` 已更新。

**残留风险**：`session_persona_state_values` 仍按 `(session_id, world_id, field_key)` 索引，不区分 persona——会话级 runtime 状态在同一 world 下跨 persona 共享（属已知设计，不在本次修复范围）。

## 2026-05-07 fix(assistant): 创建新玩家卡时清除旧卡遗留的状态值

**问题**：`persona_state_values` 按 `(world_id, field_key)` 唯一索引，同 world 下多张玩家卡共用一份状态值。通过写卡助手 `create` 新玩家卡时，旧卡的 `default_value_json` / `runtime_value_json` 不会自动清除，导致新卡"继承"了旧卡的状态字段默认值。

**改动**
- `backend/db/queries/persona-state-values.js`：新增 `clearPersonaStateValues(worldId)` —— `DELETE FROM persona_state_values WHERE world_id = ?`，用于在创建新卡时整体清零。
- `assistant/server/normalize-proposal.js`：导入 `clearPersonaStateValues`；在 `applyProposal` 的 `persona-card create` 分支，`createPersonaDb` 之后、`stateValueOps` 应用之前调用，确保新卡从字段模板 `default_value` 起步。
- `assistant/knowledge/USERCARD.md`：`create` 操作说明补充"会自动清空旧状态值"。
- `SCHEMA.md`：修正 `persona_state_values` 注释（原"一个 world 只有一个 persona"已过时）。

**验证**：`node --test assistant/tests/routes.test.js` 20/20 通过。手工验证：在同一 world 下用写卡助手创建第二张玩家卡，查询 `persona_state_values`，旧卡的行已被清除，新卡仅保留 `stateValueOps` 中显式填写的值，其余字段回归模板 `default_value`。

**同步文档**：`CHANGELOG.md`（本条）、`SCHEMA.md`、`assistant/knowledge/USERCARD.md`。

**锁定文件**：未触碰。

**残留风险**：同 world 内切换玩家卡会连带清除运行时状态值——这是现有 schema 设计的固有约束（多 persona 共用一份状态值），不在本次修复范围内；将来若要隔离，需给 `persona_state_values` 添加 `persona_id` 列并迁移数据。

## 2026-05-07 feat(assistant): 写卡助手抽屉支持左侧拖拽改宽 + 滚动条接入全局风格 + 重新生成不再 remount user 气泡

**改动**
- `assistant/client/useAssistantStore.js`：新增 `width`（默认 400px，clamp 到 [320, 720]）+ `setWidth`，与 `isOpen` 一起 `partialize` 持久化。
- `assistant/client/AssistantPanel.jsx`：
  - 抽屉 `<aside>` 改为 inline `style={{ width }}`（去掉硬编码 `w-[400px]`）。
  - 左边沿加 4px 命中区拖拽手柄 `cursor-ew-resize`，hover 显示 1px 朱砂引线；`onPointerDown` 走 `setPointerCapture` + 在手柄元素本身挂 `pointermove/up/cancel`，松手前临时把 `body.style.userSelect='none'` 防止文字被选中。
  - **重新生成 / 编辑后页面闪烁(类刷新感)** 修复：`handleRegenerate` / `handleEdit` 改为复用原 messageId（`replaceTailWithUser(prev.id, ..., prev.id)`），React 以同 key 复用 user 气泡 DOM，不再 unmount→remount，`we-bubble-in` 入场动画也不会重复触发；assistant 气泡仍按预期 unmount → PendingBubble → 新流式气泡的过渡。
- `assistant/client/MessageList.jsx`：消息列表滚动容器加 `we-assistant-scroll` 类。
- `frontend/src/styles/chat.css`：把 `.we-assistant-scroll` 选择器并入既有 `.we-chat-area / .we-settings-body / .we-persona-drawer-body / .we-edit-panel-overlay` 的 4px / `var(--we-color-border-default)` 滚动条规则组，复用全局风格，不再单独维护一份。

**验证**
- 在浏览器中打开抽屉：左边沿能拖拽改宽，松手后宽度持久化（刷新仍生效），上限 720 / 下限 320。
- 抽屉内消息列表滚动条与世界书 / 编辑面板等的 4px 朱砂尾色一致。
- 发送一条消息得到回复后点"重新生成"或"编辑确认"，user 气泡原地停留（不再先消失再重新淡入）；assistant 气泡按"消失 → 三点 → 流式回填"自然过渡。

**同步文档**：`CHANGELOG.md`（本条），`ARCHITECTURE.md` 不涉及（仅前端 UI 行为，未触动 SSE 协议 / 任务状态机）。

**锁定文件**：未触碰。

**残留风险**：拖拽过程中正文如有大量富文本 / Markdown 解析，宽度持续变化会触发 ReactMarkdown 重新计算行宽，低端机可能轻微卡顿；可接受。

## 2026-05-07 fix(assistant): /agent 路由按 task.status 主动关闭 SSE

**动机**：之前 `runParentAgent` 完成后 `/api/assistant/agent` 不调 `res.end()`，旧 fetch 永远挂在 `reader.read()`，靠客户端 abort 兜底，留下竞态隐患（旧/新客户端并发收 `delta` 双写、`messages_changed` 广播误覆盖本地 store）。

**改动**：`assistant/server/routes.js` 在 `/agent` 处理器加 finally：
- `executing` 分支：入队 `pendingUserMessages` 后保留长连接（沿用旧行为）
- `awaiting_approval` / `paused` / `executing` 终态：保留长连接，等用户 `/approve` 或后续 step 事件通过本连接广播；依赖客户端 abort（`handleSend` / `handleRegenerate` / `handleEdit` 起新流前都已主动 abort）解订阅
- 其余（`planning` 直接对话回复、`completed` / `failed` / `cancelled` 终态）：`detachSse(task.id, res)` + `res.end()`，让客户端 `reader.read()` 收到 done 后自然退出，`handleSend` 的 `await streamAgent` 自然 resolve

`catch` 写 `task_failed` 前增加 `!res.writableEnded` 兜底。

**验证**：
- 直接对话："你好" → 收到回复后 `await streamAgent` 自然 resolve，浏览器 Network 面板显示该请求完成；下一轮 send 不再依赖 abort 也能干净起新流。
- 计划模式：触发 `write_plan_doc` → `awaiting_approval` 后 SSE 依然保留；点"确认执行"→ 子步骤 SSE 事件正常推送到原连接。

**同步文档**：`CHANGELOG.md`（本条），`ARCHITECTURE.md` §14 写卡助手段补充 "SSE 关闭时机"。

**残留风险**：长连接（`awaiting_approval` / `paused` / `executing`）仍需客户端 abort 才能从 `sseClients` 中移除；面板关闭/刷新时浏览器自然断 TCP，Node `res.on('close')` 也会 detach，目前没有内存泄漏路径。

## 2026-05-07 fix(assistant): 重新生成 / 编辑后 user 消息被吞

**问题**：点"重新生成"或"编辑确认"后，刚刚替换的新 user 消息从对话区直接消失（连同 assistant 回复一起）。

**根因**：`/api/assistant/agent/:taskId/truncate` 路由在截断后调用 `taskStore.emit({ type:'messages_changed', messages: task.messages })`，会广播给 **所有** 仍订阅 `sseClients` 的连接。上一次 send 留下的旧 SSE fetch 还挂在 `reader.read()`，它会在客户端 `apiTruncateFrom` 返回前后异步收到这帧 `messages_changed`（此时 `task.messages` 已是空数组），`ingestEvent` 用它直接覆盖本地 `messages`，把刚 `replaceTailWithUser` 写入的新 user 消息也一并清掉。

**改动**：`assistant/client/AssistantPanel.jsx`，在 `handleRegenerate` / `handleEdit` 调 `apiTruncateFrom` **之前** 先 `abortRef.current?.abort?.()`：浏览器 abort → Node `res.on('close')` → `taskStore.detachSse` 把旧连接从 `sseClients` 拿掉；之后 truncate 广播 `messages_changed` 时无订阅者收到，本地 store 不被覆盖。

**验证**：发送一条消息得到回复 → 点"重新生成"或"编辑确认"，新 user 消息原地保留并立即出现 PendingBubble，随后 assistant 流式正常返回。

**同步文档**：`CHANGELOG.md`（本条）。

**残留风险**：服务端 `/agent` SSE 仍未在 `runParentAgent` 后 `res.end()`，依赖客户端 abort 才能解订阅；后续可再补一道服务端兜底。

## 2026-05-07 fix(assistant): 重新生成的页面闪烁 + 流式光标换行另起

**问题**
- 点"重新生成"或"编辑后重发"时，对话区先变空再重新填回，整页明显闪烁/跳动。
- 流式过程中末尾光标位于最后一段段落 **下方新行** 而非段尾。

**根因**
- `handleRegenerate` / `handleEdit` 顺序执行 `truncateFromId(prev.id)` → 等到下一行 `pushUserMessage` 之间，React 会先以"空 messages"完成一次 commit，然后才用 push 后的状态再 commit 一次。中间这帧导致用户看到的就是闪烁。
- 流式光标用 `<span class="inline-block">` 作为 `<SimpleMarkdown>` 的兄弟节点；ReactMarkdown 输出最末是 `<p>`（block），sibling span 自然落到下一行。

**改动**
- `assistant/client/useAssistantStore.js`：新增 `replaceTailWithUser(prevId, content, newId)`，单次 `set` 完成"截到 prevId 之前 + 追加新 user 消息"，消除中间空帧。
- `assistant/client/AssistantPanel.jsx`：
  - `handleSend` 增加 `opts.skipPush` / `opts.messageId`，允许调用方先把 user 消息原子写入 store、本函数只负责开 SSE。
  - `handleRegenerate` / `handleEdit` 改为：服务端 `apiTruncateFrom` → `replaceTailWithUser` → `handleSend(text, { skipPush:true, messageId:newId })`。
- `assistant/client/MessageList.jsx`：删除流式末尾的独立 `<span>` 光标；assistant 气泡在 `streaming && content` 时挂 `we-stream-bubble` 类。
- `frontend/src/index.css`：`.we-stream-bubble > :last-child::after` 用 CSS 伪元素生成光标，作为最后一个块级子元素的 inline-block ::after，落在段尾、不再换行。`we-stream-pulse` 关键帧只控 opacity，移除 transform 以免位移微抖。

**验证**：发送一句话获取回复后点"重新生成"或编辑用户消息后确认；对话区不再先空后填、无可见跳动；流式过程光标始终贴在最后一段末尾。

**同步文档**：`CHANGELOG.md`（本条；已合并并替换 4 处修复条目）。

**锁定文件**：未触碰。

**残留风险**：若 markdown 末节点是 `<ul>/<ol>/<pre>` 等块级容器，`::after` 会落在容器内底端的空白处而非"最后一个文字字符"右侧，视觉略偏；流式正文绝大多数情况以 `<p>` 收尾，可接受。

## 2026-05-13 fix(assistant): 写卡助手断点续传改为后台静默自动恢复

**动机**：当前写卡助手任务在面板断开、页面刷新或服务重启后，虽然 `task-store` 能保留 `running / paused / interrupted by restart` 快照，但前端恢复时只会重新补订阅 SSE，不会再次进入 `runParentAgent`。结果就是任务停在 `paused` / 假性 `running`，用户必须再手动输入一句“继续”才能拉起，体验上像“断点续传失效一半”。

**改动**

- `assistant/server/task-store.js`
  - 为任务新增仅运行期使用的 `executionActive` 标记；hydrate / create 时默认为 `false`，不写入 SQLite。
  - 新增 `setExecutionActive()` / `isExecutionActive()`，供路由区分“真的还在跑”与“只剩持久化快照、执行器已丢”。
- `assistant/server/parent-agent.js`
  - 新增内部 `RESUME_SENTINEL`，作为“静默恢复”专用入口；恢复时不追加可见 user 消息，也不清空本轮 `appliedResources` / `lastToolFailure`。
  - `runParentAgent()` 进入时设置 `executionActive=true`，无论正常完成、暂停、失败或取消，最终都会在 `finally` 里复位为 `false`。
- `assistant/server/routes.js`
  - `POST /api/assistant/agent` 新增 `resume:true` 分支。
  - 当任务处于 `running / paused / failed(interrupted by restart)` 时，可在不新增用户输入的情况下静默恢复；若 `running` 且 `executionActive=true`，则只附着到现有 SSE，不会并发启动第二个 agent loop。
- `assistant/client/api.js` + `assistant/client/AssistantPanel.jsx`
  - 新增 `resumeTask()` API。
  - 面板恢复快照后，遇到 `running / paused / interrupted by restart` 会自动走静默 resume；`awaiting_approval` 仍只补订阅，不会越过审批门。
- 测试
  - `assistant/tests/routes-http.test.js` 覆盖 `resume:true` 在 `paused / interrupted` 上的恢复路径，并验证不会追加空 user 消息。
  - `assistant/tests/parent-agent.test.mjs` 覆盖 `RESUME_SENTINEL` 不写入可见 user 消息。
  - `frontend/tests/assistant/api.test.js` 覆盖前端 `resumeTask()` 的请求体与 SSE 解析。

**验证**

- `node --test assistant/tests/routes-http.test.js assistant/tests/parent-agent.test.mjs`
- `cd frontend && npx vitest run tests/assistant/api.test.js`

**残留风险**

- “静默恢复”只针对 `running / paused / interrupted by restart`。`awaiting_approval` 仍按设计停在审批门前；如果用户预期它也自动继续，那是产品规则问题，不是恢复链路故障。
- `executionActive` 是纯内存态，只用于防止单进程内重复拉起；跨进程分布式部署若以后出现，需要改成更强的分布式互斥。

## 2026-05-07 fix(assistant): 写卡助手对话气泡 UX 四处修复

**问题**
- user 气泡总是撑满 80% 宽度，短文本（如"你好"）也被拉得很宽，不会随内容收缩。
- 用户发送后到首个 SSE delta 到达之前，没有任何视觉占位，看起来像卡住了。
- assistant 流式过程中末尾的方块光标 `h-3.5 w-[7px]` + step-end 硬切 + 随 markdown 重渲染换位，整体观感"鬼畜乱跳"。
- **重新生成后字符级双写**（"你你好好！我是 WorldEngine 写！我是 WorldEngine 写卡助手…"）：服务端 `/agent` 路由在 `runParentAgent` 完成后没有调用 `res.end()`，旧的 SSE fetch reader 一直挂着；前端 `handleSend` 起新流时也没 abort 旧 controller，于是旧/新两个 fetch 同时挂在 `sseClients` 集合里，每个 delta 被 `ingestEvent` 追加两次。

**改动**
- `assistant/client/MessageList.jsx`
  - `UserMessage` 外层从 `group max-w-[80%]` 改为 `group flex max-w-[80%] flex-col items-end`，让气泡按内容自适应（content-fit）并始终右对齐，ActionBar 跟随气泡宽度。
  - 新增 `PendingBubble`（左侧 typing-dots，复用 `.we-typing-dots` + `.typing-dot.typing-dot-accent`）；MessageList 接收 `pending` 布尔，挂载在消息列表底部，挂载时自动滚到底。
  - 流式光标：方块 `h-3.5 w-[7px] / we-blink step-end` → 细线 `h-[0.9em] w-[2px] translate-y-[2px] / we-stream-pulse 1.2s ease-in-out`，随行高自适应，平滑脉冲、不再硬闪、不再在文本末尾跳动。
- `assistant/client/AssistantPanel.jsx`：
  - 派生 `pendingAssistant = lastMsg.role === 'user' && !TERMINAL_STATUSES.has(status)`，传给 `MessageList`（首个 delta 触发新建 assistant 消息后自动消失）。
  - `handleSend` 起新流前先 `abortRef.current?.abort?.()`，杀掉上一条仍 hang 在 `reader.read()` 的旧 fetch；浏览器 abort → Node 侧 `res.on('close')` → `taskStore.detachSse`，旧 res 不再收到广播，重新生成 / 连续发送不再字符级双写。
- `frontend/src/index.css`：新增 `@keyframes we-stream-pulse`（保留旧 `we-blink` 不动以免影响其他用法）。

**验证**：前端 `npm run dev`，打开写卡助手 → 发送"你好"，气泡随文本收缩；发送后到流式开始之前出现左侧三点跳动；流式过程末尾光标为细线平滑脉冲，不再随每个 token 跳动。

**同步文档**：`CHANGELOG.md`（本条）。`ARCHITECTURE.md` / `SCHEMA.md` 不涉及。

**锁定文件**：未触碰。

**残留风险**：`pendingAssistant` 在 `awaiting_approval` 且最后一条恰为 user 时也会显示（当前流程下不会出现该序列；若后续父代理改为 plan→user 追问→approve 的链路需复评条件）。

## 2026-05-07 feat(assistant): 写卡助手批 B — parent-agent 切流式（resolveToolContext + chat 双步）

**动机**：批 A 恢复了 UX 形态，但父代理仍走 `llm.completeWithTools`，最终文本作为单条 delta 一次性下发，token-by-token 流式体验缺失。批 B 改回 2-步式：先非流式跑工具循环，再流式生成正文。

**改动**

- `assistant/server/parent-agent.js`：`runParentAgent` 不再调用 `completeWithTools`，改为：
  1. `llm.resolveToolContext(messages, tools, { temperature: 0.3 })` 跑非流式 tool-use 循环，返回富化后的 messages（system + history + tool_calls + tool_results）。期间 meta tools（write_plan_doc / dispatch_subagent / finalize_task 等）的 SSE 事件照常 emit。
  2. 提前 `appendMessage({ role:'assistant', content:'' })` 占位拿到 stamped id；
  3. `for await (chunk of llm.chat(enriched, { temperature: 0.7 }))` 逐 chunk emit `{ type:'delta', delta, messageId }`；
  4. 流式结束后通过 `taskStore.__testables.tasks.get(id)` 把累积文本回填到那条预占消息。
- 错误路径：流式中途抛错时，移除预占的（多半空内容）assistant 消息，再 emit `task_failed` + `done`，保持 task.messages 干净。
- 新增 `TOOLS_RESOLVED` 日志，标识 tool-loop 结束、流式开始的边界。

**未改动**：sub-agent.js 仍走 `completeWithTools`（输出会被父代理摘要，无需流式）；`backend/llm/index.js` 完全沿用现有 API；前端 `appendDelta` 已在批 A 支持 `evt.messageId` adopt，无需调整。

**验证**：`node --test assistant/tests/*.{js,mjs}` 26/26 通过；`vite build` 成功；后端 boot 日志干净；curl SSE 可见多条小 chunk delta（每条 1-3 字符），不再是单条大 delta。

## 2026-05-07 feat(assistant): 写卡助手批 A — UX 恢复 + 稳定 messageId + 截断/删除 API

**动机**：单代理 + 计划文档迁移后，UX 比旧 AssistantPanel 出现回退：消息无入场动效、缺少 typing dots、缺 hover 操作按钮（复制/编辑/删除/重新生成）、编辑后无法自动重发。这批改动按"批 A"恢复交互，同时落地后端稳定 messageId 和截断/删除 API 作为前置条件。

**改动**

- 后端
  - `assistant/server/task-store.js`：`appendMessage` 现在为每条消息打上稳定 `id`（来源：调用方传入或 `msg-<uuid8>`），并返回 stamped 后的对象；新增 `deleteMessage(taskId, messageId)` 与 `truncateFrom(taskId, messageId)`。
  - `assistant/server/parent-agent.js`：`runParentAgent(task, userInput, opts?)` 接受可选 `userMessageId`，落库时透传给 `appendMessage`；assistant 终稿落库后把服务端 stamped id 一并放进 `delta` 事件（`{ type:'delta', delta, messageId }`），使前端流式气泡能采纳服务端 id。新增 `user_message` SSE 事件，让前端给 push 进去的 user 消息补上服务端 id（用于后续 truncate/delete）。
  - `assistant/server/routes.js`：`POST /api/assistant/agent` 接受 `messageId` 字段并透传给 parent-agent；新增 `POST /api/assistant/agent/:taskId/truncate` 与 `POST /api/assistant/agent/:taskId/delete`。两者在 `executing` 状态下拒绝（避免与正在运行的工具竞态），其它状态执行后 emit `messages_changed` 全量 messages 让所有 SSE 订阅者重新对齐。
- 前端
  - `assistant/client/api.js`：新增 `truncateFrom(taskId, messageId)` / `deleteMessage(taskId, messageId)`；`streamAgent` 入参新增 `messageId`，会被一起 POST 到 `/agent`。
  - `assistant/client/useAssistantStore.js`：本地 push user 消息时生成 `msg-<uuid8>` 临时 id 并随 streamAgent 上传；`appendDelta` 接受 server `messageId` 后覆盖到正在流式的 assistant 气泡上；新增 `deleteMessage` / `truncateFromId` / `replaceMessages` actions；新增 `user_message` / `messages_changed` 两个事件分支；末尾 `{ done: true }` 帧会清掉最后一条 assistant 的 `streaming` 标志，让 ActionBar 出现。
  - `assistant/client/MessageList.jsx` 重写：恢复 hover ActionBar（user：复制/编辑/删除；assistant：复制/重新生成/删除），编辑态用 textarea + ESC 取消 / Cmd|Ctrl+Enter 确认；删除采用两段确认（首次"确认？"，2 秒内再次点击才真正删除）；流式开始无内容时显示 typing dots，首字到达后显示闪烁光标。所有样式改用 Tailwind 工具类 + `--we-*` 变量，删除全部内联 `style`。
  - `assistant/client/AssistantPanel.jsx`：新增 `handleEdit / handleDelete / handleRegenerate` 并下传到 MessageList。编辑：truncate 到该 user 消息（含）→ 本地 mirror → 用编辑后内容重新 `handleSend`，触发新一轮流式回复。重新生成：truncate 到对应 user 消息（含）→ mirror → 重发 prev.content。`handleSend(overrideText?)` 仅在 `typeof overrideText === 'string'` 时使用 override（避免 onClick event 被误当文本）。
  - `frontend/src/index.css`：新增 `@keyframes we-bubble-in`（消息入场）和 `@keyframes we-blink`（流式光标）；MessageList 用 Tailwind 任意值类 `animate-[we-bubble-in_0.2s_ease-out]` / `animate-[we-blink_0.8s_step-end_infinite]` 引用。

**验证**

- `node --test assistant/tests/*.{js,mjs}` 26/26 pass。
- `cd frontend && npx vite build` 通过；bundled CSS 中可见 `@keyframes we-bubble-in` / `@keyframes we-blink` 与对应 `animate-[…]` 任意值类。
- `cd backend && npm run dev` 启动后输出 `SERVER_READY:3000` 无报错。
- `cd assistant/client && npx eslint .` 无 warning。

**残留风险**

- truncate/delete 在 `executing` 状态下被服务端拒绝（400），前端目前只通过 ingestEvent 错误提示，未做更细的按钮状态门控；如需在 executing 中提供 abort 体验，需要走 cancelTask 路线。
- `messages_changed` 事件目前由 truncate/delete 端点主动 emit；后续若有其它路径直接修改 `task.messages` 也需要自行 emit 才能让其它打开的面板同步。
- `replaceMessages` action 已新增但当前未被使用（`messages_changed` 直接走 ingestEvent 内联替换），保留以备未来跨标签页同步。

---

## 2026-05-07 feat(assistant): 重做写卡助手为单接口父子代理 + 计划文档架构

**动机**：旧双轨架构（`/chat` 兼容轨 + `/tasks` 通用轨）维护成本高，研究→规划→执行→提案审批四段链路彼此耦合，prompt 与重试策略散落在 `task-researcher.js` / `task-planner.js` / `task-executor.js` 三处；前端 `ChangeProposalCard` 步骤审批卡 UI 与 Claude Code 风格不符，且需要在每个 step 暂停重审，节奏割裂。整体迁移到 Claude Code 风格的“父代理 + 通用执行子代理 + Markdown 计划文档”架构。

**改动**

- 后端
  - 删除 `/api/assistant/chat`、`/api/assistant/tasks`、`/api/assistant/tasks/:taskId/answer|approve-plan|approve-step` 全部路由与相关 task-researcher / task-planner / task-executor / agent-factory / 6 资源域子代理；改为单一主入口 `POST /api/assistant/agent`（SSE）+ 4 个辅助接口 `agent/:taskId/{approve,cancel,plan-doc,(GET task)}`。
  - 新增 `assistant/server/parent-agent.js`：长上下文父代理，每轮在首条 system 自动注入 `assistant/knowledge/CONTRACT.md`，工具集 = 3 读 + 6 apply（每 targetType 各一）+ 5 meta（`update_plan_doc` / `dispatch_subagent` / `request_clarification` / `complete_task` / `fail_task`）。
  - 新增 `assistant/server/sub-agent.js`：通用执行子代理，按 `task.targetType` 注入 `assistant/knowledge/<TARGET>.md`（一次只一份），工具集 = 3 读 + 1 个对应 `apply_*` 工具。替代过去 6 个资源域子代理。
  - 新增 `assistant/server/plan-doc.js`：计划文档原子读写 + 状态字段切换；物理文件落 `/.temp/assistant/<taskId>.md`，每次更新 emit `plan_doc_updated` SSE。
  - 抽出 `assistant/server/normalize-proposal.js`：所有 apply 入口统一过 `normalizeProposal()` 后再调资源服务，作为落库唯一安全边界。
  - `assistant/server/task-store.js`：补 `pendingUserMessages` 队列与 `takeUserMessages()` API，承载 spec §6.4 暂停语义。
  - 知识库：`assistant/knowledge/` 下 7 份 markdown（CONTRACT + WORLDCARD/CHARCARD/USERCARD/GLOBALPROMPT/CSSSNIPPET/REGEXRULE）替代旧 `assistant/prompts/` 中分散的 planner / 子代理提示词。
- 前端
  - 删除 `ChangeProposalCard` 步骤审批卡 UI 与对应 store 字段；新增 `frontend/src/components/assistant/PlanDocViewer.jsx` 渲染父代理维护的 markdown 计划文档。
  - `assistant/client/AssistantPanel.jsx` 改用单接口 `/agent` 驱动；`useAssistantStore.js` 监听 `plan_doc_updated` / `awaiting_approval` / `paused` / `step_completed` 等新事件清单；`api.js` 新增 `fetchPlanDoc(taskId)`、`approveTask(taskId)`、`cancelTask(taskId)`。
  - SSE 事件白名单收敛为 14 类：`delta` / `thinking` / `plan_doc_updated` / `awaiting_approval` / `plan_approved` / `step_started` / `step_completed` / `step_failed` / `paused` / `task_completed` / `task_failed` / `task_cancelled` / `done` / `error`。
- 任务规模与状态机
  - 步骤数 < 3 走 simple mode：父代理直接 apply，不写计划文档、不进入审批门。
  - 步骤数 ≥ 3 走 plan mode：父代理 `update_plan_doc` 写计划 → 切 `awaiting_approval` → 用户 `/approve` → 父代理逐步 `dispatch_subagent`。
  - 状态机：`planning → clarifying → awaiting_approval → executing → paused → completed | failed | cancelled`。
  - 暂停语义：`executing` 中用户消息 enqueue，不打断当前 step；step 结束后由父代理消费、切 `paused`、`update_plan_doc` 调整未完成步骤、等用户再次 `/approve` 续派（详见 Phase 9 条目）。

**参考**

- 设计文档：`docs/superpowers/specs/2026-05-07-assistant-redesign-design.md`
- 实施计划：Phase 0/1（knowledge）→ Phase 2（normalizeProposal/applyProposal）→ Phase 3（plan-doc TDD）→ Phase 4（apply_* 工具 ×6 + list_resources）→ Phase 5（通用 sub-agent）→ Phase 6（parent-agent + task-store）→ Phase 7（routes 重构）→ Phase 8（前端重构）→ Phase 9（暂停语义）→ Phase 10（集成测试）→ Phase 12（文档同步）
- 落库安全边界唯一入口：`assistant/server/normalize-proposal.js`
- 知识库分工权威：`assistant/knowledge/CONTRACT.md`

**残留风险**

- 前端 localStorage 旧持久化键 `we-assistant-v1` 不再被新代码读写；浏览器若残留旧条目无功能影响，仅占少量空间，无需主动清理。
- 旧 `/chat` `/tasks` 端点已彻底删除；任何外部脚本或文档若仍指向旧路径需要同步更新到 `/agent`。
- 计划文档物理文件落在 `/.temp/assistant/`，跨重启不持久；若服务进程重启正在 `awaiting_approval` 的任务会丢失计划文档原文（task-store 内存态本身重启即清空，对齐预期）。
- refactor(assistant): 父代理单轮决策从 provider 内置 tool-loop 切到服务端显式 action protocol。`assistant/server/parent-agent.js` 不再调用 `llm.completeWithToolsDetailed()`，改为每轮用 `llm.complete()` 请求单个 JSON action，由服务端解析并执行 `reply / call_tool / finish / await_approval / pause / fail`；`call_tool` 严格一轮一个工具，工具失败写回 `last_tool_failure` 后交给下一轮解释或修正，非法 JSON / 非法 action / 缺失参数 / 未知工具都会在有限重试后受控失败。`assistant/prompts/parent-agent.md` 与 `assistant/knowledge/CONTRACT.md` 同步改成 action-protocol 契约；`backend/llm/providers/mock/index.js` 新增 `MOCK_LLM_ACTION(_QUEUE)` 便于按轮测试 action JSON；`assistant/server/tools/adapter.js` 补发 tool failure error 到 SSE/task snapshot。回归更新 `assistant/tests/parent-agent.test.mjs`、`assistant/tests/routes-http.test.js`，覆盖多轮 `call_tool`、非法 JSON、工具失败后二轮 `reply`、审批恢复与终态续聊。验证：`node --test assistant/tests/parent-agent.test.mjs assistant/tests/routes-http.test.js`。
- fix(assistant): 修复写卡助手“口头说已派发子代理、实际没派发却直接 completed”的假执行问题。根因有两层：一是 `assistant/knowledge/CONTRACT.md` 还残留旧版 `finish / call_tool / fail` 文本协议表述，容易把父代理带回“先说动作、再等服务端解析”的旧心智；二是 `assistant/server/parent-agent.js` 允许“无工具的自然文本回复”直接按 completed 收尾，导致模型在只调用了 `preview_card` 等读工具后，若输出“现在派发子代理...”之类文本，也会被当成正常完成。修复：清理 CONTRACT 中的旧协议描述，明确真实收尾只能靠 `reply_to_user`；同时给父代理加一层兜底闸门，当最终普通文本命中“已派发/已创建/正在执行”等动作声明，但本轮没有真实 `dispatch_subagent`、`step` 或新增 `appliedResources` 时，改走 `softFail(agent loop error: model claimed it dispatched or executed work without a real dispatch_subagent step)`，不再把假动作写入 assistant 完成消息。回归：`assistant/tests/parent-agent.test.mjs` 新增“preview 后口头声称派发但未真实 dispatch → 软失败”，并保留普通问答自然文本 completed 用例。
- fix(worlds): 将书架卡片的拖拽位移层与 hover 视觉层拆分，避免跨行重排时被挤开的卡片在补位瞬间向左跳帧
- fix(worlds): 将书架网格行距从相对容器宽度的 `10%` 改为固定 token 间距，避免首行与第二行在宽屏下被异常拉大
- break(theme): 主题内核残留风险收口。删除全部 legacy theme alias 与 shorthand 入口，`frontend/src`、`themes/`、README、CHANGELOG、主题测试夹具统一迁到正式语义 token；`tokens.css` 不再保留兼容映射。`lovable-cream` 因仓库当前没有合法 `Camera Plain` 字体文件，明确改为 humanist sans 降级栈并在 README / 主题文档中标注“未达成 DESIGN.md 原字体，仅完成链路收口”。主题 API 与主题包 JSON 结构不变，但旧主题 CSS 若仍引用已删除别名，本次后将不再生效。
- feat(theme): lovable-cream 按 `DESIGN.md` 完成严格 cream 收口。① 在 `frontend/src/assets/fonts/instrument-sans/` 新增自托管 `Instrument Sans Variable`（含 OFL license），并由 `frontend/src/themes/fonts.css` 统一声明 `@font-face`，让主题继续只通过 `--we-font-*` token 引用字体；② 重写 `themes/lovable-cream/theme.css`，把字体栈改为 Instrument Sans + 中文 fallback，并将中性色压缩到 `#f7f4ed / #1c1c1c / #fcfbf8 / #eceae4 / #5f5f5d` 与 `#1c1c1c` 透明度体系，统一被动/交互边框、topbar 反相区、卡片/面板层级和低饱和状态色；③ 更新 `themes/lovable-cream/theme.json` 与 `themes/README.md` 的主题定位文案，说明 lovable-cream 现为基于 `DESIGN.md` 的严格适配版，不再依赖系统字体碰运气。
