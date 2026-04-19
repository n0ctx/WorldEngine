/**
 * 全局 Prompt 子代理
 * 输入：task（任务描述）、configData（当前全局配置）
 * 输出：{ type, operation, changes, newEntries, explanation }
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../../backend/llm/index.js';
import { extractJson } from './extract-json.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt() {
  return readFileSync(
    path.resolve(__dirname, '../../prompts/sub-global-prompt.md'),
    'utf-8',
  );
}

/**
 * @param {string} task       主代理描述的任务
 * @param {object} configData 当前全局配置（api_key 已脱敏）
 * @returns {Promise<object>} 结构化提案
 */
export async function processGlobalPrompt(taskObj, configData, _context) {
  const task = typeof taskObj === 'string' ? taskObj : (taskObj.task ?? '');
  // 脱敏：移除 api_key，避免 LLM 看到
  const safeConfig = {
    global_system_prompt: configData.global_system_prompt,
    global_post_prompt: configData.global_post_prompt,
    context_history_rounds: configData.context_history_rounds,
    memory_expansion_enabled: configData.memory_expansion_enabled,
    llm: {
      provider: configData.llm?.provider,
      model: configData.llm?.model,
      temperature: configData.llm?.temperature,
      max_tokens: configData.llm?.max_tokens,
      base_url: configData.llm?.base_url,
      // api_key 故意不包含
    },
    writing: configData.writing,
  };

  const existingEntriesStr = JSON.stringify(
    (configData.existingEntries || []).map((e) => ({
      id: e.id,
      title: e.title,
      summary: e.summary,
      mode: e.mode,
    })),
    null,
    2,
  );

  const prompt = loadPrompt()
    .replace('{{CONFIG_DATA}}', JSON.stringify(safeConfig, null, 2))
    .replace('{{EXISTING_ENTRIES}}', existingEntriesStr)
    .replace('{{TASK}}', task);

  const messages = [{ role: 'user', content: prompt }];

  try {
    const raw = await llm.complete(messages, { temperature: 0.5, maxTokens: 2000 });
    const result = extractJson(raw);
    return {
      type: 'global-config',
      operation: result.operation ?? 'update',
      changes: result.changes ?? {},
      entryOps: Array.isArray(result.entryOps) ? result.entryOps : [],
      newEntries: (Array.isArray(result.entryOps) ? result.entryOps : Array.isArray(result.newEntries) ? result.newEntries : []).filter((e) => e.op === 'create' || !e.op),
      explanation: result.explanation ?? '已生成全局配置修改方案',
    };
  } catch (err) {
    throw new Error(`全局 Prompt 子代理失败：${err.message}`);
  }
}
