# History Changelog

每条改动一行，格式：`- **<type>: <一句话标题>** — <核心动作 / 关键文件 / 兼容性要点，控制在 1–2 句内>`。

新条目追加在列表顶部；细节查 git log，本文件只承担"为什么现在长这样"的索引。

- **fix: 写卡助手 HUD 隐藏工具调用标注** — `PlanTaskHud.jsx` displayText 追加正则，去掉任务文本末尾的 `(xxx.update)` 格式工具名，用户不再看到底层参数
- **fix: 写卡助手审批状态持久化并封死执行中重开计划** — `routes.js` / `parent-agent.js` / `runtime.js` 将审批 checkpoint 持久化为 `pending|approved`，禁止 `awaiting_approval` 阶段直接 `dispatch_subagent`，也禁止执行中 `replace_steps` 把前端重新打回待确认；`AssistantPanel.jsx` / `api.js` 同步补 approve 失败回滚
- **fix: 写卡助手 agent 健壮性三项修复** — ①`runtime.js` 用 `pendingPauseSignal` 延迟抛出 ToolLoopControlSignal，修复信号被内层 catch 吞噬导致错误信息为 "tool loop control: paused" 的 bug；②同文件在 `dispatchSubAgent` 前解析 `step-N` 引用为真实 UUID（兼容 `step:N` 格式）；③`parent-agent.md` 补充 dependsOn 不可作实体 ID 的约束及核对步骤必须先 preview 的要求；④`apply-character-card.js` 分离 `id` 与 `entityId` 返回字段，语义与 persona-card 对齐
- **fix: 写卡助手审批与恢复边界补齐** — `runtime.js` 禁止被拒计划沿用旧 `plan_doc` 直接 dispatch、`replace_steps` 继续强制至少 3 个未完成步骤；`parent-agent.js` / `AssistantPanel.jsx` 持久化并识别 `consecutive tool failures` 暂停原因；assistant 文档同步这些状态语义
- **fix: 开场白消息 hover 不显示操作按钮** — `MessageList.jsx` 通过 `!hasMore && msgIdx===0` 检测开场白并传 `isGreeting` prop；`MessageItem.jsx` 对 assistant 消息在 `isGreeting` 为真时跳过 `.we-message-actions` 渲染
- **fix: 写卡助手审批流 /approve 重复提示** — `edit_plan_doc replace_steps` 补触发 `AWAITING_APPROVAL` 信号（`runtime.js`）；`write_plan_doc` 工具描述去除"等待用户 /approve"字样；`parent-agent.md` 加禁令"严禁在 reply_to_user 提示用户输入 /approve"
- **fix: 写卡助手三项 bug 修复** — ①`streamAssistantText` 归一化字面量 `\n` → 实际换行（`parent-agent.js`）；②`renderPlanDoc` 去除 title 里已带的 operation 后缀防止 HUD 重复（`plan-doc.js`）；③审批 sentinel 消息强制要求直接 dispatch 不得口头确认（`parent-agent.js`）
- **docs: 前端代码规范落文档并写入 CLAUDE.md 强制阅读路由** — 新增 `docs/references/frontend/coding-standards.md`（CSS token 规范、文件职责、主题分层、组件命名、inline style 禁令、三态要求、数据边界、验证清单）；CLAUDE.md 任务分流表与高频硬约束追加强制跳转；`frontend/index.md` 先读列表补第 0 项
- **feat: 写卡助手"新消息"按钮视觉美化** — 从纯色边框卡改为 accent 朱砂色胶囊按钮，带跳动箭头动画与悬停上浮效果；样式提取为 `.we-asst-new-msg-btn` / `.we-asst-new-msg-arrow`，位于 `frontend/src/themes/chat.css`
- **fix: 条目顺序列表标题与类型颜色区分** — `.we-entry-order-title` 从 `fg-muted`（secondary）改为 `fg`（primary），与类型文字（tertiary）形成明显层级对比；仅改 `frontend/src/themes/pages.css`
- **refactor: 三个 CSS 文件 padding/margin/gap 替换为 --we-space-* token** — chat.css 约 55 处替换 + 23 处 design exact 标注；pages.css 约 24 处替换 + 17 处标注；ui.css 约 62 处替换 + 62 处标注；标准值（2/4/8/12/16/24/32px）替换为 var(--we-space-xxs/xs/sm/md/lg/xl/2xl)，非标准值加 `/* design exact */` 注释
- **refactor: ui.css box-shadow 内联 color-mix 提取为 --we-shadow-* token** — 新增 3 个 token（`--we-shadow-btn-primary-inner-glow`、`--we-shadow-range-thumb`、`--we-shadow-range-thumb-active`）至 `tokens.css` 物理质感阴影区段末尾；替换 `ui.css` 4 处内联 color-mix（行 94/2255/2263/2272）；两个主题包无需额外覆写（color-mix 引用的基变量已在主题中覆写）
- **refactor: pages.css / ui.css 硬编码 font-size 标注 no token** — 4 处 10px 及以下（7px/8px/9px×2）均无对应 token，保留原值并加 `/* no token */` 注释；仅改 `frontend/src/themes/pages.css` 和 `frontend/src/themes/ui.css`
- **refactor: chat.css 硬编码 font-size 替换为 --we-text-* token** — 14 处替换（12px/11px/16.5px/13px×2/12.5px/15px/11px×4/12px/14px×2 → 对应 token），5 处保留原值并加 `/* no token */` 注释（9px/10px×3/16px）；仅改 `frontend/src/themes/chat.css`
- **style: 统一所有表单框为单一蓝框样式** — select-trigger.open 改用 `--we-color-border-focus`；session-item__edit-input / flags-custom-input / chapter-edit-input / entry-order-token-input 默认边框改为 `--we-color-border-default`；number input 抑制原生 spinner 避免双框；影响 `ui.css` `chat.css` `pages.css`
- **refactor: 主题三层对齐补全** — 新增 `check-theme-alignment.mjs` 脚本；`_template/theme.css` 补入 26 个盲区 token（bookshelf/entry-row/elevated/scrim/dialog 等）；`classic-parchment` 和 `lovable-cream` 覆盖率均升至 100%；README 补充对齐检查说明；`npm run check:themes` 注册到 package.json
- **style: lovable-cream 严格对齐 DESIGN.md** — 修复卡片/面板/条目行背景由 #ffffff 改为 #f7f4ed、移除所有 drop-shadow 改用 border 定义边界、focus shadow 统一为 0 4px 12px rgba(0,0,0,0.1)、bookshelf 卡片背景同步为奶油色；`themes/lovable-cream/theme.css`、`theme.json`

---

- **fix: assistant 消息脚注激活条目超宽截断** — `ActivatedEntriesRow` 改用 `useLayoutEffect` + ResizeObserver 直接 DOM 操作，保持单行同行展示，超宽时显示 `+n` badge，token stat span 加 `flex-shrink: 0` + `white-space: nowrap` 防止"命中"被拆字；`chat.css` + `ActivatedEntriesRow.jsx`。
- **fix: SectionTabs 内 chip 按钮样式丢失** — `.we-panel-card-action--chip` 及基础 action 样式仅对 `.we-panel-card-actions` 父级生效，`SectionTabs` 将 tab actions 渲染到 `.we-section-tabs-globals` / `.we-section-tabs-actions`，导致 NearbyPanel「制卡/保存/移除」等按钮边框/背景全部丢失；`ui.css` 将三组选择器统一追加 `.we-section-tabs-globals` / `.we-section-tabs-actions` 变体。
- **fix: `shells/book-spread/` UI 规范审计 BLOCKER 全量修复** — 去除 `pageLayoutRenderer` 的 `!p-0` 越权（`PageRight` 新增 `flush` 变体 + `.we-page-right--flush` / `.we-page-right__body`）；`MemoryRecallOverlay` 改用 `.we-memory-recall*` 语义类，弃用 Tailwind 任意值 `min-h-[32px]` 与裸 opacity `/75` `/55`；`TopBar` 按钮文案去装饰符（`✦ 助手` → `助手`、`前往世界列表 →` → `前往世界列表`）、`caret` 与 `dropdown` 的 `display:inline-block` / `transform-origin` 迁回 ui.css；`PageTransition` 容器布局抽到 `.we-page-transition`，shell 层彻底无 inline style。
- **fix: 修复 `pages.css` 中 `.we-marginalia::before` 内容被错位到文件末尾导致大段规则被 CSS 嵌套吞掉** — 第 3344 行的 `::before` 仅剩空括号开闭,真正的 `content/position/...` 声明出现在文件末尾(3849 行附近)作为孤立块,触发原生 CSS 嵌套,使 3344–3849 之间的 `.we-session-list-create` 等几百条规则变成 `.we-marginalia::before .we-xxx` 永不命中;表现为 chat/写作页"新建会话"按钮无边框、`+` 图标与文本断行。把内容搬回 `::before` 块内并删除末尾孤立片段。
- **chore: `shells/book-spread/components/` 改名 `chrome/`** — 与通用 `frontend/src/components/` 命名解耦,语义贴近 shell chrome;同步 `AppShell.jsx` / `layout/pageLayoutRenderer.jsx` 两处 import 与 AppShell 顶部注释。
- **refactor: index.css 组件 CSS 按域拆到 themes/{ui,pages,chat}.css + 主题可配置面扩到排版节奏** — `frontend/src/index.css` 2438 → 94 行（保留 :root 基线 / utility / prefers-reduced-motion），组件规则全量迁移；`themes/tokens.css` 新增 `--we-tracking-*` 六档字距 scale；字号/行高/圆角/duration/字距全部 token 化；可达性 outline:none 配 focus-visible 替代；`themes/README.md` 推荐覆盖顺序补 §7 排版节奏，`themes/_template/theme.css` 加 §7 注释段；现有 `classic-parchment` / `lovable-cream` 无需改动（沿用默认值，零视觉变化）。
- **refactor: 将 `classic-parchment` shell 更名为 `book-spread`** — `frontend/src/shells/classic-parchment/` 改名 `book-spread/`，`selectShell.js` 同步 import/`DEFAULT_SHELL_ID`/`SHELLS`；主题包 `themes/classic-parchment/` 保持原名不动，区分"shell（结构）"与"theme（token）"。
- **chore: `ui.css` 死代码清理与可达性补丁** — 删除 `.we-btn-icon`/`.we-scope-row`/`.we-scope-check`/`.we-checkbox` 零引用类；抽取公共纤细滚动条 utility；状态 tag close 按钮命中区扩至 32×32；`RegexRulesManager` icon 按钮补 `aria-label`。
- **refactor: `ui.css` UI 规范整改，字号/行高/焦点环/弹窗阴影全部 token 化** — `tokens.css` 新增 `--we-text-2xs/-body/-control/-display`、`--we-leading-flush/-snug`、`--we-shadow-dialog`、`--we-focus-ring`；`ui.css` 替换约 60 处裸值；0.5px 字号统一就近圆整，产生轻微视觉位移。
- **refactor: `pages.css` UI 规范全量整改，所有裸值替换为设计 token** — 消除 9 类裸值违规（rgb/radius/z-index/transition/font-size/gap/padding/margin/clamp），约 330 处裸值替换；采用"就近吸附"策略，全站存在轻量视觉位移待人工巡检。
- **chore: 清理 11 个僵尸 CSS token，`check:tokens` 归零** — 删除 `tokens.css` 与三套主题里没有任何 `var()` 引用的 11 个令牌；`check:tokens` 现为 194 声明 / 194 引用。
- **refactor: 收敛 `frontend/src/index.css` 内 T29A 设计令牌块到 `tokens.css` 真源** — 删除 T29A 并行命名 token 与 `@theme` 块；JSX 改用 `[var(--we-color-*)]` arbitrary value；`--we-radius-md` 由 12px 回退到 `tokens.css` 8px。
- **fix: 修复 6 个 CSS 设计令牌孤儿引用并新增 token 健康检查脚本** — 新增 `npm run check:tokens` 并入 `lint`；修正 `ErrorBoundary` 用 `--we-color-bg-surface`、`pages.css` 用 `--we-duration-normal`；`tokens.css` 补 4 个运行时 token 默认值。
- **fix: 收紧编辑页标题与 tabs 之间的空白并对齐左边界** — `pages.css` 收口编辑页 `SectionTabs` 纵向 gap、tab 内边距与左侧校正。
- **fix: 关闭世界与角色类创建抽屉的成功态卡死问题** — 创建成功后 overlay 分支不再 `replace` 到编辑页而是返回背景页；直达创建会主动清 `saving` 并开加载态。
- **fix: 将世界卡底部角色数与时间移到左下角** — `pages.css` 调整 `we-world-card-meta` 绝对定位至左下角。
- **fix: 拉开世界卷宗书架首排卡片与外框的顶部距离** — `we-worlds-bookshelf` 增加顶部 padding 并同步移动端。
- **fix: 轻微下移世界页右侧操作按钮组** — 桌面端 `we-worlds-header-actions` 微调对齐，移动端重置。
- **fix: 收紧世界卷宗书架顶部留白并把卡片区整体上提** — 收紧 `WorldsPage` 画布/页头/卷宗书架的垂直节奏。
- **fix: 清理后端测试子进程继承的 mock LLM 环境污染** — `backend/tests/helpers/test-env.js` 新增净化子进程 env helper；`llm/index.test.js`、`server-hooks.test.js` 接入。
- **fix: 统一编辑框焦点外框并删除红色高亮残留样式** — 通用 input/textarea/聊天/章节标题焦点统一到中性外圈，删除遗留红框规则（`ui.css`/`chat.css`/`index.css`）。
- **fix: 移除世界页层板承托并收口为纯容器卷宗书架** — `WorldsPage` 删除按行测量逻辑与 plank 主题 token，回归"容器+卡片"。
- **fix: 为世界页补中性卷宗书架骨架并拆分主题风格化出口** — 核心层新增 frame/back-panel/plank/plain-card token，由 `classic-parchment`/`lovable-cream` 分别覆写。
- **fix: 对齐卷宗书架页三列表头的分隔线高度** — `we-characters-col-header` 增加统一最小高度。
- **fix: 将设置弹窗加载态改为轻度模糊遮罩** — `SettingsPage` 移除"加载中…"文字，改为带 `role="status"` 的轻模糊 scrim。
- **fix: 将更多 provider 的模型价格改为动态拉取官方定价页** — `routes/config.js` 扩展 Gemini/Grok/DeepSeek/Kimi/Qwen/SiliconFlow 动态抓取 + TTL 缓存 + 静态兜底。
- **fix: 将设置页默认排版从宽松展示板收束为紧凑工作台** — `FormGroup`/`FieldLabel` 新增 `settings` 变体；统一控件密度与导航活跃态。
- **fix: 统一设置页下拉框与输入框的表单基线** — `Select`/`ModelCombobox` 字号/行高/盒模型对齐 `Input`；新增 `we-settings-inline-field-row`。
- **fix: 统一右侧状态栏空值字段不再显示"点击编辑"** — `StatusSection` 空态走统一占位常量，移除 tooltip。
- **fix: 去掉状态栏编辑态内部控件的重复焦点框** — `we-status-inline-surface` 内统一关闭 input/textarea/tag/select 的内层 focus。
- **fix: 状态栏文本字段编辑改为支持自动换行** — text 字段 inline editor 由单行 input 切到 textarea，`Ctrl/Cmd+Enter` 提交。
- **fix: 允许多行列表编辑在必要时突破阅读态高度** — `SeamlessEditableSurface` 高度测量取 `max(rectHeight, scrollHeight)`，列表编辑器解除 `overflow:hidden`。
- **fix: 修正会话状态枚举选项缺失与列表编辑态尺寸漂移** — `session-state-values` 查询补 `enum_options`；列表 inline editor 收敛 tag/删除按钮盒模型。
- **fix: 修正状态栏列表编辑换行溢出与下拉开向判断** — shared surface 支持非 textarea 测量；`Select` 改为参考最近裁剪祖先判向。
- **fix: 收敛消息与状态字段的无缝编辑态切换** — 新增 `SeamlessEditableSurface`/`useSeamlessEditLayout`，chat/writing/assistant 与 status 字段全部接入镜像层。
- **fix: 右侧状态栏改为按字段类型内联编辑且放开 llm_auto 手改** — `StatusSection` 按类型切换编辑器；可编辑性仅排除 `system_rule`。
- **fix: 为副模型后台整理补上超时护栏与失败提示** — aux LLM 任务可配置超时（默认 20s），新增 `postprocess_failed` SSE 事件，前端弹 toast。
- **fix: 稳定 chat/write 历史消息的同毫秒排序与截断行为** — `messages` 查询按 `created_at ASC, rowid ASC` 排序；截断辅助同步语义。
- **docs: 将 CLAUDE 根入口从主轴选择改为任务场景路由** — `CLAUDE.md` 改为"先按任务场景选首读链路"；各主轴 `index.md` 补跨模块片段。
- **docs: 精简 CLAUDE.md 入口结构并压缩重复导航信息** — 压缩为"工作原则/任务分流/真源与同步"三段式。
- **fix: 修正 think 块内重复标签导致前缀正文外泄的解析错误** — 新增 `core/utils/think-blocks.js` 状态机解析；chat/writing/assistant 消息渲染统一接入。
