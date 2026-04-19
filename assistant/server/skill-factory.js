/**
 * Skill 工厂
 *
 * createSkillTool(def, skillCtx) → LLM tool（含 execute 函数）
 *
 * skill 定义结构：
 *   { name, description, parameters, proposalType }
 *
 * skillCtx（按请求绑定）：
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
const log = createLogger('as-skill', 'cyan');
const PROPOSAL_TTL_MS = 30 * 60 * 1000;

function sendSSE(res, data) {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function loadSkillPrompt(skillName) {
  const fileName = skillName.replace(/_skill$/, '').replace(/_/g, '-') + '.md';
  return readFileSync(path.resolve(__dirname, '../prompts', fileName), 'utf-8');
}

/**
 * 创建单个 skill tool（绑定请求上下文）
 *
 * @param {object} def          skill 静态定义
 * @param {string} def.name     工具名（如 'world_card_skill'）
 * @param {string} def.description
 * @param {object} def.parameters  JSON Schema
 * @param {string} def.proposalType  proposal type（如 'world-card'）
 *
 * @param {object} skillCtx
 * @param {object} skillCtx.res              SSE response 对象
 * @param {Map}    skillCtx.proposalStore
 * @param {function} skillCtx.normalizeProposal
 * @param {object} skillCtx.previewCardTool  已绑定 context 的 preview_card tool
 */
export function createSkillTool(def, { res, proposalStore, normalizeProposal, previewCardTool }) {
  return {
    type: 'function',
    function: { name: def.name, description: def.description, parameters: def.parameters },
    execute: async ({ task, operation = 'update', entityId = null }) => {
      const taskId = `sk-${randomUUID().slice(0, 8)}`;
      log.info(`START  ${formatMeta({ skill: def.name, operation, entityId, task: previewText(task, { limit: 160 }) })}`);
      sendSSE(res, { type: 'routing', taskId, target: def.name, task });

      const heartbeat = setInterval(() => sendSSE(res, { type: 'thinking', taskId }), 5000);
      try {
        // skill LLM 拥有 read_file 和 preview_card 两个工具
        const skillTools = [READ_FILE_TOOL, previewCardTool];

        // 将 entityId 注入任务描述，供 skill LLM 调用 preview_card 时使用
        const entityHint = entityId ? `\n\n实体 ID：${entityId}` : '';
        const prompt = loadSkillPrompt(def.name)
          .replace('{{TASK}}', task + entityHint);

        const messages = [{ role: 'user', content: prompt }];
        let raw = await llm.completeWithTools(messages, skillTools, {});
        log.info(`RAW  ${formatMeta({ skill: def.name, chars: raw?.length ?? 0, preview: shouldLogRaw('llm_raw') ? previewText(raw) : undefined })}`);

        let result;
        try {
          result = extractJson(raw);
        } catch {
          log.warn(`RETRY  ${formatMeta({ skill: def.name, reason: 'json-parse-failed' })}`);
          messages.push({ role: 'assistant', content: raw });
          messages.push({ role: 'user', content: '只重发一个合法 JSON 对象，不要代码块，不要解释。' });
          raw = await llm.complete(messages, { temperature: 0.1 });
          log.info(`RAW  ${formatMeta({ skill: def.name, retry: true, chars: raw?.length ?? 0 })}`);
          result = extractJson(raw);
        }

        const proposal = normalizeProposal(result, { type: def.proposalType, operation, entityId });
        const token = randomUUID();
        proposalStore.set(token, { proposal, expiresAt: Date.now() + PROPOSAL_TTL_MS });
        log.info(`DONE  ${formatMeta({ skill: def.name, operation: proposal.operation, token: token.slice(0, 8), changeKeys: Object.keys(proposal.changes || {}) })}`);
        sendSSE(res, { type: 'proposal', taskId, token, proposal });

        return `[${def.name}] 提案已生成（token: ${token.slice(0, 8)}）。${proposal.explanation}`;
      } catch (err) {
        log.error(`FAIL  ${formatMeta({ skill: def.name, error: err.message })}`);
        // 不发 error SSE —— 主代理的工具循环可能重试，如果重试成功则该错误是误报。
        // 若主代理最终无法解决，它会以文字向用户说明。
        return `[${def.name}] 执行失败：${err.message}`;
      } finally {
        clearInterval(heartbeat);
      }
    },
  };
}
