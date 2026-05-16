/**
 * saved-nearby-recall.js — saved nearby 角色按需召回（preflight 判定）
 *
 * 对外暴露：
 *   decideSavedNearbyRecall({ sessionId, savedRows })
 *     → Promise<string[]>   返回 hit 的 nearby id 列表（按候选清单顺序），失败静默返回 []
 *
 * 镜像 summary-expander.decideExpansion 的范式：独立取最近 1 user + 1 assistant 上下文，
 * 与候选清单一起喂给 aux 模型；输出严格 JSON `{"recall":["id1", ...]}`。
 */

import { getMessagesBySessionId } from '../db/queries/messages.js';
import * as llm from '../llm/index.js';
import {
  MEMORY_EXPAND_DECISION_MAX_TOKENS,
  ALL_MESSAGES_LIMIT,
} from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import { renderBackendPrompt, loadBackendPrompt } from '../prompts/prompt-loader.js';
import { resolveAuxScope } from '../utils/aux-scope.js';
import { applyTemplateVars } from '../utils/template-vars.js';

const log = createLogger('saved-nearby-recall');

/**
 * @param {{ sessionId: string, savedRows: Array<{id:string,name:string,persona:string}> }} options
 * @returns {Promise<string[]>}
 */
export async function decideSavedNearbyRecall({ sessionId, savedRows }) {
  if (!Array.isArray(savedRows) || savedRows.length === 0) return [];

  const allMessages = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  let lastUser;
  let lastAsst;
  for (let i = allMessages.length - 1; i >= 0 && !(lastUser && lastAsst); i -= 1) {
    const m = allMessages[i];
    if (!lastUser && m.role === 'user') lastUser = m;
    else if (!lastAsst && m.role === 'assistant') lastAsst = m;
  }
  const contextText = [
    lastAsst ? `AI：${lastAsst.content}` : '',
    lastUser ? `用户：${lastUser.content}` : '',
  ].filter(Boolean).join('\n');

  if (!contextText) return [];

  const candidateLines = savedRows.map((r, idx) => {
    const personaRaw = (r.persona && String(r.persona).trim()) || '（无）';
    // 与主 prompt 渲染口径一致：persona 内的 {{char}} 应展开为该角色自己
    const persona = applyTemplateVars(personaRaw, { char: r.name });
    return `- #${idx + 1} (id: ${r.id}) 【${r.name}】${persona}`;
  }).join('\n');

  const messages = [
    {
      role: 'system',
      content: loadBackendPrompt('saved-nearby-recall-system.md'),
    },
    {
      role: 'user',
      content: renderBackendPrompt('saved-nearby-recall-user.md', {
        CONTEXT_TEXT: contextText,
        CANDIDATE_LINES: candidateLines,
      }),
    },
  ];

  try {
    const raw = await llm.complete(messages, {
      temperature: 0,
      maxTokens: MEMORY_EXPAND_DECISION_MAX_TOKENS,
      configScope: resolveAuxScope(sessionId),
      callType: 'saved_nearby_recall_judge',
      conversationId: sessionId,
    });

    const stripped = (raw || '')
      .replace(/<think>[\s\S]*?<\/think>\n*/g, '')
      .replace(/<think>[\s\S]*$/, '')
      .trim();
    const cleaned = stripped.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);

    if (!parsed || !Array.isArray(parsed.recall)) return [];

    const validIds = new Set(savedRows.map((r) => r.id));
    const result = [...new Set(parsed.recall.filter((id) => typeof id === 'string' && validIds.has(id)))];
    return result.slice(0, savedRows.length);
  } catch (err) {
    log.warn(`decideSavedNearbyRecall preflight 失败，降级为不召回: ${err.message}`);
    return [];
  }
}
