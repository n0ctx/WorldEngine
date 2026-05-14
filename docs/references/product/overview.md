# Product Overview

产品当前实际形态：用户看到什么、能做什么、核心边界是什么。

> 技术实现细节去 `docs/references/backend/*.md` 与 `docs/references/frontend/*.md`；本页只讲用户可见行为与产品边界。

## 任务分流

- 想确认世界 / 角色 / 会话层级：看 `## 信息架构`
- 想确认 Chat / Writing 的差异：看 `## 会话模式`
- 想确认状态、记忆、写卡助手是否对用户可见：看对应章节
- 想改 README 产品叙事：先读本页，再读 `product/index.md`

## 产品定位

WorldEngine 是本地优先的 AI 角色扮演与创意写作工具，面向：

- 有自己世界观的创意写作者
- TRPG 玩家 / GM
- 需要长期维护角色、状态和记忆的一对多叙事场景

不面向：只想快速开一个轻量角色聊天的人。

## 信息架构

```text
卷宗书架 / 世界列表
└─ 世界
   ├─ 角色
   ├─ Persona（玩家身份）
   ├─ 世界配置
   └─ 会话（Chat / Writing）
```

用户主路径：先建世界，再建角色 / Persona，再开会话。

## 世界与角色

- 世界承载名称、描述、封面、世界级生成参数、提示词条目、正则规则、自定义 CSS
- 角色承载头像、简介、系统提示词、生成参数覆盖、角色状态字段
- Persona 是玩家代入身份，按世界归属，可维护独立状态字段和值

## 会话模式

### Chat

- 单角色对话
- 气泡消息列表
- 支持重新生成、续写、模拟、编辑、删除
- 右侧持续展示状态相关面板

### Writing

- 多角色协作写作
- 段落块排版而非气泡
- 支持章节自动分组和标题生成
- 支持 nearby 角色与写作会话级状态

## 提示词、状态与记忆

- 提示词条目有 `always` / `keyword` / `llm` / `state` 四类触发
- 状态分三层：世界、角色、persona
- 状态有字段定义与会话运行时值，互相隔离
- 每轮回复后异步生成 turn record、向量召回、必要时展开原文
- 长期记忆与日记用于长程叙事，不等于普通消息历史

## 写卡助手

- 写卡助手是配置层 agent，不参与剧情对话
- 它通过 proposal 与 plan 协助修改世界、角色、persona、全局配置、CSS、正则
- 批准前不应直接落库
- 恢复、审批和控制信号不应混入用户可见聊天记录

## 桌面端与公开文档

- 桌面端基于 Electron，运行时数据仍在本地 `data/` 目录体系
- README 面向用户；`CLAUDE.md` 面向 agent；两者不承担彼此职责

## 相关代码文件

- `frontend/src/pages/ChatPage/`
- `frontend/src/pages/WritingSpacePage/`
- `frontend/src/components/settings/`
- `assistant/client/AssistantPanel.jsx`
