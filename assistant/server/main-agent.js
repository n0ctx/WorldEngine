/**
 * 写卡助手 — 主代理
 *
 * 职责：
 * 1. routeMessage()  — 路由决策（非流式），判断是否委托子代理
 * 2. streamResponse() — 主代理流式回复（流式）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../backend/llm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt(name) {
  return readFileSync(path.resolve(__dirname, '../prompts', name), 'utf-8');
}

// ─── 路由决策 Prompt（精简，专注输出 JSON） ───────────────────────

const ROUTING_SYSTEM = `你是一个任务路由决策器。根据用户消息，判断是否需要委托子代理修改 WorldEngine 数据。

子代理能力范围：
- world-card: 新建/修改/删除世界卡（system_prompt、post_prompt、名称、temperature、max_tokens）及其 Prompt 条目
- character-card: 新建/修改/删除角色卡（system_prompt、post_prompt、first_message）及其 Prompt 条目
- persona-card: 修改玩家卡（name、system_prompt）及玩家状态字段；每个世界只有一个玩家，只支持修改（无新建/删除）
- global-prompt: 修改全局 system prompt/post_prompt、全局 Prompt 条目、LLM 参数（temperature/max_tokens/model）
- css-regex: 新增自定义 CSS 片段、新增正则替换规则

**委托条件**：用户明确要求"新建""创建""写""修改""生成""删除"某项内容
**不委托条件**：用户在询问、讨论、寻求建议，或只是聊天

operation 取值：
- "create"：新建实体（用户说"新建""创建""帮我创建一个"）
- "update"：修改已有实体（默认）
- "delete"：删除实体（用户说"删除""删掉"）

**entityId 填写规则（重要）**：
- world-card update/delete：entityId 填世界 ID
- character-card update/delete：entityId 填角色 ID
- character-card create：entityId 填所属世界的 ID（当前上下文中已有世界时必须填，不能填 null）
- persona-card：entityId 填所属世界的 ID（persona 是 upsert，无 create/delete）
- world-card create：entityId 填 null

**玩家卡（persona-card）与角色卡（character-card）的区别**：
- 用户说"玩家卡""主角""我的角色""player""persona"→ 路由到 persona-card
- 用户说"角色卡""NPC""配角""添加角色" → 路由到 character-card
- 两者不可混淆，persona 每个世界只有一个，character 可以有多个

仅输出纯 JSON，无其他文字：

**单任务委托**：
{"action":"delegate","target":"character-card","operation":"create","task":"详细说明要做什么","entityId":"当前世界的ID"}

**多任务并行委托**（仅当同一请求需要操作多个不同实体时使用）：
{"action":"multi-delegate","tasks":[
  {"target":"world-card","operation":"create","task":"新建世界：丧尸末日背景...","taskId":"t0"},
  {"target":"character-card","operation":"create","task":"新建角色：废墟猎手...","taskId":"t1","worldRef":"t0"},
  {"target":"character-card","operation":"create","task":"新建角色：感染幸存者...","taskId":"t2","worldRef":"t0"}
]}

**worldRef 规则（严格遵守）**：
- worldRef 只在"同一请求中同时新建世界+角色"时使用，character 任务填 worldRef 指向 world 任务的 taskId
- 已有世界（上下文中有世界 ID）时创建角色：用 delegate，entityId 填世界 ID，绝对不加 worldRef
- 同时修改多个现有实体（互相独立）可用 multi-delegate，但不填 worldRef

不委托时：{"action":"respond"}`;

// ─── 路由决策 ─────────────────────────────────────────────────────

function buildRoutingContextHint(context) {
  const parts = [];
  if (context?.world?.name) parts.push(`世界「${context.world.name}」（ID: ${context.world.id}）`);
  if (context?.character?.name) parts.push(`角色「${context.character.name}」（ID: ${context.character.id}）`);
  if (!parts.length) return '';
  return `\n\n当前激活上下文：${parts.join('，')}。若用户未指定操作对象，默认对上述实体操作。`;
}

/**
 * @param {string} message  用户消息
 * @param {Array}  history  历史消息数组 [{role, content}]
 * @param {object} context  当前上下文，含 world/character/config
 * @returns {{ action: 'respond'|'delegate', target?: string, task?: string, entityId?: string }}
 */
export async function routeMessage(message, history, context = {}) {
  const msgs = [
    { role: 'system', content: ROUTING_SYSTEM + buildRoutingContextHint(context) },
    // 只取最近 3 轮历史，够判断上下文即可
    ...history
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m) => ({ role: m.role, content: String(m.content).slice(0, 500) })),
    { role: 'user', content: message },
  ];

  try {
    const raw = await llm.complete(msgs, { temperature: 0, maxTokens: 600 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { action: 'respond' };
    return JSON.parse(match[0]);
  } catch {
    return { action: 'respond' };
  }
}

// ─── 主代理流式回复 ───────────────────────────────────────────────

/**
 * @param {string} message   用户消息
 * @param {Array}  history   历史消息（含 proposal 类型，需过滤）
 * @param {object} context   { world, character, config }
 * @param {object|null} proposal 子代理生成的提案（含 explanation）
 * @returns {AsyncGenerator<string>}
 */
export async function* streamResponse(message, history, context, proposal) {
  const template = loadPrompt('main.md');
  const systemPrompt = template.replace('{{CONTEXT}}', buildContextString(context));

  // 过滤 proposal 类消息，只保留 user/assistant
  const chatHistory = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-16)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  const messages = [{ role: 'system', content: systemPrompt }, ...chatHistory];

  if (proposal) {
    // 告知主代理子代理的结果，让其生成自然的解释回复
    messages.push({
      role: 'user',
      content:
        `[ASSISTANT_CONTEXT: 子代理已分析并生成修改方案。` +
        `方案说明：${proposal.explanation}。` +
        `修改预览卡已在界面上显示，用户点击"应用"即可生效。` +
        `请用自然友好的语气向用户说明本次修改的内容和理由，1-3句话即可，不要列出技术细节。]`,
    });
  }

  messages.push({ role: 'user', content: message });

  yield* llm.chat(messages, { temperature: 0.8 });
}

// ─── 上下文字符串构建 ─────────────────────────────────────────────

function buildContextString(context) {
  const parts = [];

  if (context?.world) {
    const w = context.world;
    parts.push(
      `**当前世界**：${w.name}（ID: ${w.id}）\n` +
        `system_prompt: ${w.system_prompt?.slice(0, 400) || '（空）'}\n` +
        `post_prompt: ${w.post_prompt?.slice(0, 150) || '（空）'}`,
    );
  }

  if (context?.character) {
    const c = context.character;
    parts.push(
      `**当前角色**：${c.name}（ID: ${c.id}）\n` +
        `system_prompt: ${c.system_prompt?.slice(0, 400) || '（空）'}\n` +
        `first_message: ${c.first_message?.slice(0, 150) || '（空）'}`,
    );
  }

  if (context?.config) {
    const cfg = context.config;
    parts.push(
      `**全局配置**：provider=${cfg.llm?.provider}，model=${cfg.llm?.model || '（未设置）'}，` +
        `temperature=${cfg.llm?.temperature}，max_tokens=${cfg.llm?.max_tokens}\n` +
        `global_system_prompt: ${cfg.global_system_prompt?.slice(0, 200) || '（空）'}`,
    );
  }

  return parts.length ? parts.join('\n\n') : '（当前未选择世界或角色，用户可在顶部导航栏选择）';
}
