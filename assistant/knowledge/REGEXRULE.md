# 正则规则知识库（REGEXRULE.md）

> 写卡助手处理 `regex-rule` 类任务时加载本文件。
> 行为框架（怎么生成 JSON、怎么报告父代理）见 `assistant/prompts/sub-agent.md`，不在本文件。

## 正则规则架构

正则规则（`regex-rule`）承载文本替换：

- 文本替换（用户输入 / AI 输出 / 显示层 / prompt 副本）
- HTML 包裹（如把 `<think>` 包成 `<div class="thinking-block">`）
- Markdown 标记清洗
- Prompt 模板替换（如 `{{user}}` / `{{char}}`）

不属于正则规则：

- 视觉样式 / 主题 / 颜色 / 动画 → 属于 `css-snippet`
- prompt 文本本身 → 属于 world-card / character-card / global-config

## operation 与 entityId

| operation | entityId | 备注 |
|---|---|---|
| `create` | 不输出 | 后端生成新 ID |
| `update` | 必填，目标规则 ID（先 `preview_card(target="regex-rule")` 取得）| 只输出需要修改的字段 |
| `delete` | 必填 | `changes` 输出 `{}` |

```json
{ "type": "regex-rule", "operation": "create|update|delete", "entityId": "...", "changes": {}, "explanation": "简体中文，50字以内" }
```

## changes 字段集

allowed keys：

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 规则名称 |
| `pattern` | string | JavaScript `RegExp` 的 source 字符串，**不带首尾 `/`、不带 flags**；create/update 不能为空 |
| `replacement` | string | 替换文本，可用 `$1` `$2` 引用捕获组 |
| `flags` | string | 正则 flags，如 `"g"` / `"gs"` / `"gi"` |
| `scope` | string | 见下文 4 取值 |
| `world_id` | string\|null | 见下文"世界级 vs 全局" |
| `mode` | string | `"chat"` / `"writing"`，不确定时默认 `"chat"` |
| `enabled` | number | 一般固定 `1` |

> 不要输出 `type` / `operation`（顶层 schema 已有，changes 内不重复）。
> 不要输出大段 CSS——那是 css-snippet。
> 不要把 `pattern` 写成 `/.../gs` 形式。

## scope 取值与选择

| scope | 何时用 | 改数据库？ | 影响 LLM？ |
|---|---|---|---|
| `display_only` | 只改前端显示效果 | 否 | 否 |
| `ai_output` | 永久改写 AI 输出文本 | 是 | 是（落库后影响后续 prompt 历史）|
| `user_input` | 改写用户输入 | 是 | 是 |
| `prompt_only` | 只在送给 LLM 前替换 | 否 | 是 |

### 经验规则

- 纯显示美化（包 HTML、改样式）→ `display_only`
- 把 `<think>` 包成 `<div>` → 用 `display_only`，**不要用 ai_output**（不应永久污染历史）
- 永久清掉 AI 输出里的某些符号（如双星号加粗）→ `ai_output`
- 替换 `{{user}}` / `{{char}}` 等占位符 → `prompt_only`
- 处理用户输入文本 → `user_input`

## 世界级 vs 全局（world_id 取值）

`world_id` 决定规则的作用域：

| world_id | 含义 | 何时用 |
|---|---|---|
| `null` | **全局规则**：所有世界生效 | 通用清洗、占位符替换、统一标记包裹 |
| `"<具体世界 ID>"` | **世界级规则**：仅指定世界生效 | 该世界专用的术语替换、风格化标记 |

新建全局规则时固定 `world_id: null`。需要按世界限定时，`world_id` 必须是真实存在的 worldId（一般由父代理从 `context.worldId` 注入）。

## 正则书写规范

- `pattern` 是 source，不带首尾 `/`
- JSON 字符串里的反斜杠要双写：`\\`
- 跨行匹配时，优先 `[\s\S]` + `flags:"g"` 或 `flags:"gs"`
- 模式要尽量窄，避免误伤正常文本
- `replacement` 使用 `$1` `$2` 引用捕获组

### 常见写法

| 目的 | pattern | flags |
|---|---|---|
| 匹配 `<think>...</think>` 块 | `<think>([\\s\\S]*?)</think>` | `gs` |
| 去除双星号加粗 | `\\*\\*(.+?)\\*\\*` | `g` |
| 替换 `{{user}}` 占位符 | `\\{\\{user\\}\\}` | `g` |
| 合并多余空行 | `\\n{3,}` | `g` |

## 操作手册

### 把 `<think>` 包成 HTML 容器（典型用法）

```json
{
  "name": "thinking-block 包装",
  "pattern": "<think>([\\s\\S]*?)</think>",
  "replacement": "<div class=\"thinking-block\">$1</div>",
  "flags": "gs",
  "scope": "display_only",
  "world_id": null,
  "mode": "chat",
  "enabled": 1
}
```

### 永久去掉 AI 输出的双星号加粗

```json
{
  "name": "去除双星号",
  "pattern": "\\*\\*(.+?)\\*\\*",
  "replacement": "$1",
  "flags": "g",
  "scope": "ai_output",
  "world_id": null,
  "mode": "chat",
  "enabled": 1
}
```

### 把 `{{user}}` 替换成具体名字（送 LLM 前）

```json
{
  "name": "替换 user 占位符",
  "pattern": "\\{\\{user\\}\\}",
  "replacement": "旅行者",
  "flags": "g",
  "scope": "prompt_only",
  "world_id": null,
  "mode": "chat",
  "enabled": 1
}
```

### 修改 / 删除现有规则

- 必须先 `preview_card(target="regex-rule")` 拉规则列表（含 id / name / scope / world_id）
- 从中确认目标 ID 后再生成提案
- update 只输出需要修改的字段

## 反例

- 输出整段 CSS（应改用 css-snippet）
- 用 `ai_output` 做纯展示包裹（应用 `display_only`，避免永久污染历史）
- 把 `pattern` 写成 `/.../gs`（应去掉首尾 `/` 与 flags）
- create / update 输出空 `pattern`
- 把 `world_id` 填一个不存在的世界 ID
- 用正则去做本应由 prompt 或状态字段完成的逻辑
- 模式过宽导致误伤正常文本
