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

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
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
        // 执行子代理拥有 read_file 和 preview_card 两个工具（用于补充主代理未提供的数据）
        const agentTools = [READ_FILE_TOOL, previewCardTool];

        // 分离指令层（system）和任务层（user），提升指令遵循率
        const entityHint = entityId ? `\n\n实体 ID：${entityId}` : '';
        const messages = buildAgentMessages(def.name, task + entityHint);

        // temperature: 0 — 精确 JSON 输出任务，排除随机性
        let raw = await llm.completeWithTools(messages, agentTools, { temperature: 0 });
        log.info(`RAW  ${formatMeta({ agent: def.name, chars: raw?.length ?? 0, preview: shouldLogRaw('llm_raw') ? previewText(raw) : undefined })}`);

        let result;
        try {
          result = extractJson(raw);
        } catch {
          log.warn(`RETRY  ${formatMeta({ agent: def.name, reason: 'json-parse-failed' })}`);
          // retry 时保留 system 层，追加纠错指令，继续用 completeWithTools 保留工具能力
          messages.push({ role: 'assistant', content: raw });
          messages.push({ role: 'user', content: '你的输出无法解析为合法 JSON。请只重发 1 个 JSON 对象，不要代码块、注释或解释。' });
          raw = await llm.completeWithTools(messages, agentTools, { temperature: 0 });
          log.info(`RAW  ${formatMeta({ agent: def.name, retry: true, chars: raw?.length ?? 0 })}`);
          result = extractJson(raw);
        }

        const proposal = normalizeProposal(result, { type: def.proposalType, operation, entityId });
        const token = randomUUID();
        proposalStore.set(token, { proposal, expiresAt: Date.now() + PROPOSAL_TTL_MS });
        const changeKeys = Object.keys(proposal.changes || {});
        log.info(`DONE  ${formatMeta({ agent: def.name, operation: proposal.operation, token: token.slice(0, 8), changeKeys })}`);
        sendSSE(res, { type: 'proposal', taskId, token, proposal });

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

export const __testables = {
  buildAgentMessages,
};
