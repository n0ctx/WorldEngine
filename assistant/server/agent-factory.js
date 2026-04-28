/**
 * 执行子代理工厂
 *
 * createAgentTool(def, agentCtx) → LLM tool（含 execute 函数）
 *
 * 子代理定义结构：
 *   { name, description, parameters, proposalType }
 *
 * agentCtx（按请求绑定）：
 *   { res, proposalStore, normalizeProposal, previewCardTool }
 */

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../backend/llm/index.js';
import { createLogger, formatMeta, previewText, shouldLogRaw } from '../../backend/utils/logger.js';
import { extractJson } from './tools/extract-json.js';
import { READ_FILE_TOOL } from './tools/project-reader.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const log = createLogger('as-agent', 'cyan');
const PROPOSAL_TTL_MS = 30 * 60 * 1000;
const MAX_JSON_RETRY = 2;
const MAX_PROPOSAL_RETRY = 2;

function sendSSE(res, data) {
  if (res.writableEnded) return;
  try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch { /* 客户端已断连 */ }
}

function loadAgentPrompt(agentName) {
  const fileName = agentName.replace(/_agent$/, '').replace(/_/g, '-') + '.md';
  return readFileSync(path.resolve(__dirname, '../prompts', fileName), 'utf-8');
}

/**
 * 将 agent prompt 模板分离为 system + user 消息。
 * 约定：每个 prompt 文件末尾有 "## 本次任务\n\n{{TASK}}" 段落，
 * 其前的内容作为 system 指令，任务段作为 user 消息。
 */
function buildAgentMessages(agentName, taskContent) {
  const raw = loadAgentPrompt(agentName);
  const TASK_SECTION = '\n## 本次任务\n';
  const idx = raw.indexOf(TASK_SECTION);
  if (idx !== -1) {
    const systemPart = raw.slice(0, idx).trim();
    const userPart = raw.slice(idx + TASK_SECTION.length).replace('{{TASK}}', taskContent).trim();
    return [
      { role: 'system', content: systemPart },
      { role: 'user', content: userPart },
    ];
  }
  // fallback：整段放 user（旧格式兼容）
  return [{ role: 'user', content: raw.replace('{{TASK}}', taskContent) }];
}

/**
 * 创建单个执行子代理 tool（绑定请求上下文）
 *
 * @param {object} def          子代理静态定义
 * @param {string} def.name     工具名（如 'world_card_agent'）
 * @param {string} def.description
 * @param {object} def.parameters  JSON Schema
 * @param {string} def.proposalType  proposal type（如 'world-card'）
 *
 * @param {object} agentCtx
 * @param {object} agentCtx.res              SSE response 对象
 * @param {Map}    agentCtx.proposalStore
 * @param {function} agentCtx.normalizeProposal
 * @param {object} agentCtx.previewCardTool  已绑定 context 的 preview_card tool
 */
export function createAgentTool(def, { res, proposalStore, normalizeProposal, previewCardTool }) {
  return {
    type: 'function',
    function: { name: def.name, description: def.description, parameters: def.parameters },
    execute: async ({ task, operation = 'update', entityId = null }) => {
      const taskId = `sk-${randomUUID().slice(0, 8)}`;
      log.info(`START  ${formatMeta({ agent: def.name, operation, entityId, task: previewText(task, { limit: 160 }) })}`);
      // target 使用 proposalType（如 'world-card'），与前端 TARGET_LABELS 保持一致
      sendSSE(res, { type: 'routing', taskId, target: def.proposalType, task });

      const heartbeat = setInterval(() => sendSSE(res, { type: 'thinking', taskId }), 5000);
      try {
        const proposal = await runAgentDefinition(def, {
          task,
          operation,
          entityId,
          normalizeProposal,
          previewCardTool,
        });
        const token = randomUUID();
        const expiresAt = Date.now() + PROPOSAL_TTL_MS;
        proposalStore.set(token, { proposal, expiresAt });
        const changeKeys = Object.keys(proposal.changes || {});
        log.info(`DONE  ${formatMeta({ agent: def.name, operation: proposal.operation, token: token.slice(0, 8), changeKeys })}`);
        sendSSE(res, { type: 'proposal', taskId, token, proposal, expiresAt });

        // 富化工具结果：把 changes 内容摘要和条目计数返回给主代理，
        // 让主代理流式回复时有足够上下文，避免空泛总结
        const changeSummary = changeKeys.map((k) => {
          const v = (proposal.changes || {})[k];
          return `  ${k}: ${typeof v === 'string' ? v.slice(0, 120) : v}`;
        }).join('\n');
        const entryCount = Array.isArray(proposal.entryOps) ? proposal.entryOps.length : 0;
        const sfCount = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps.length : 0;
        const summaryLines = [
          `${proposal.type} ${proposal.operation}（entityId: ${proposal.entityId ?? 'null'}）`,
          changeSummary,
          entryCount ? `entryOps: ${entryCount}条` : null,
          sfCount ? `stateFieldOps: ${sfCount}条` : null,
          `说明：${proposal.explanation}`,
        ].filter(Boolean);
        return `[${def.name}] 提案已生成（token:${token.slice(0, 8)}）\n${summaryLines.join('\n')}`;
      } catch (err) {
        log.error(`FAIL  ${formatMeta({ agent: def.name, error: err.message })}`);
        sendSSE(res, { type: 'error', taskId, error: err.message });
        return `[${def.name}] 执行失败：${err.message}`;
      } finally {
        clearInterval(heartbeat);
      }
    },
  };
}

export async function runAgentDefinition(def, {
  task,
  operation = 'update',
  entityId = null,
  normalizeProposal,
  previewCardTool,
}) {
  const agentTools = [READ_FILE_TOOL, previewCardTool];
  const entityHint = entityId ? `\n\n实体 ID：${entityId}` : '';
  const messages = buildAgentMessages(def.name, task + entityHint);

  async function generateOnce({ retry = false } = {}) {
    const raw = await llm.completeWithTools(messages, agentTools, { temperature: 0.3 });
    log.info(`RAW  ${formatMeta({ agent: def.name, retry, chars: raw?.length ?? 0, preview: shouldLogRaw('llm_raw') ? previewText(raw) : undefined })}`);
    return raw;
  }

  async function parseWithJsonRetry(raw) {
    let current = raw;
    for (let attempt = 1; attempt <= MAX_JSON_RETRY; attempt++) {
      try {
        return extractJson(current);
      } catch (jsonErr) {
        log.warn(`RETRY  ${formatMeta({ agent: def.name, reason: 'json-parse-failed', attempt, maxRetry: MAX_JSON_RETRY, error: jsonErr.message })}`);
        messages.push({ role: 'assistant', content: current });
        const hint = attempt === 1
          ? `你的输出无法解析为合法 JSON（错误：${jsonErr.message}）。请只重发 1 个 JSON 对象，不要代码块、注释或解释。`
          : `你的输出仍无法解析为合法 JSON（错误：${jsonErr.message}）。请严格输出 1 个纯 JSON 对象：不要任何解释文字、不要 Markdown 代码块、不要 // 注释、不要尾部逗号。`;
        messages.push({ role: 'user', content: hint });
        current = await generateOnce({ retry: true });
      }
    }
    return extractJson(current);
  }

  let raw = await generateOnce();
  let result = await parseWithJsonRetry(raw);
  for (let attempt = 1; attempt <= MAX_PROPOSAL_RETRY; attempt++) {
    try {
      return normalizeProposal(result, { type: def.proposalType, operation, entityId });
    } catch (proposalErr) {
      log.warn(`RETRY  ${formatMeta({ agent: def.name, reason: 'proposal-normalize-failed', attempt, maxRetry: MAX_PROPOSAL_RETRY, error: proposalErr.message })}`);
      messages.push({ role: 'assistant', content: JSON.stringify(result) });
      messages.push({
        role: 'user',
        content:
          `你的 JSON 已能解析，但不符合 WorldEngine proposal 契约（错误：${proposalErr.message}）。` +
          '请基于上一版提案定向修复，不要改写无关内容；只重发 1 个完整 JSON 对象，不要代码块、注释或解释。',
      });
      raw = await generateOnce({ retry: true });
      result = await parseWithJsonRetry(raw);
    }
  }
  return normalizeProposal(result, { type: def.proposalType, operation, entityId });
}

export { buildAgentMessages };

export const __testables = {
  buildAgentMessages,
};
