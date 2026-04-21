/**
 * 写卡助手 — 主代理（单 Agent 架构）
 *
 * 职责：
 *   runAgent(message, history, context, tools) — 工具调用预检 + 流式回复
 *
 * 工具集由 routes.js 按请求绑定，包含：
 *   read_file、preview_card、world_card_agent、character_card_agent、
 *   persona_card_agent、global_prompt_agent、css_snippet_agent、regex_rule_agent
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../backend/llm/index.js';
import { createLogger, formatMeta, previewText } from '../../backend/utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('as-main', 'yellow');

function loadPrompt(name) {
  return readFileSync(path.resolve(__dirname, '../prompts', name), 'utf-8');
}

/**
 * 主代理入口（单 Agent，tool-use 架构）
 *
 * 流程：
 * 1. resolveToolContext() — 工具调用循环（非流式）
 *    主代理可调用 preview_card / read_file 研究现状，再调用执行子代理分发任务
 *    执行子代理调用时会向 SSE 流发送 routing / proposal 事件
 * 2. llm.chat() — 流式生成最终回复
 *
 * @param {string} message   用户消息
 * @param {Array}  history   历史消息 [{ role, content }]
 * @param {object} context   { world, character, config, worldId, characterId }
 * @param {Array}  tools     按请求绑定的完整工具集
 * @returns {AsyncGenerator<string>}
 */
export async function* runAgent(message, history, context, tools) {
  const systemPrompt = loadPrompt('main.md').replace('{{CONTEXT}}', buildContextString(context));

  const chatHistory = history
    .filter((m) => m.role === 'user' || m.role === 'assistant')
    .slice(-16)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory,
    { role: 'user', content: message },
  ];

  log.info(`START  ${formatMeta({ msg: previewText(message, { limit: 120 }), history: chatHistory.length, tools: tools.length })}`);

  // 阶段 1：工具调用循环（研究 + 分发执行子代理）
  const enrichedMessages = await llm.resolveToolContext(messages, tools, { temperature: 0 });

  // 阶段 2：流式回复
  log.info(`STREAM  ${formatMeta({ enriched: enrichedMessages.length - messages.length })}`);
  yield* llm.chat(enrichedMessages, { temperature: 0.8 });
}

// ─── 上下文字符串构建 ─────────────────────────────────────────

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

  return parts.length
    ? parts.join('\n\n')
    : '（当前未选择世界或角色，用户可在顶部导航栏选择）';
}

export const __testables = {
  buildContextString,
};
