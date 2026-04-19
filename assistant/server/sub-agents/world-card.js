/**
 * 世界卡子代理
 * 输入：taskObj（{ task, operation, entityId }）、worldData（当前世界完整数据）
 * 输出：{ type, operation, entityId, changes, entryOps, newEntries, explanation }
 * 支持 operation: 'create' | 'update' | 'delete'
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../../backend/llm/index.js';
import { extractJson } from './extract-json.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt() {
  return readFileSync(
    path.resolve(__dirname, '../../prompts/sub-world-card.md'),
    'utf-8',
  );
}

/**
 * @param {string|object} taskObj  任务描述字符串，或 { task, operation, entityId }
 * @param {object} worldData       当前世界数据（create 时为空对象 {}）
 * @param {object} _context        附加上下文（可选）
 * @returns {Promise<object>} 结构化提案
 */
export async function processWorldCard(taskObj, worldData, _context) {
  const taskDesc = typeof taskObj === 'string' ? taskObj : (taskObj.task ?? '');
  const operation = typeof taskObj === 'object' ? (taskObj.operation ?? 'update') : 'update';
  const entityId = (typeof taskObj === 'object' ? taskObj.entityId : null) ?? worldData.id ?? null;

  // delete 不调用 LLM，直接返回删除提案
  if (operation === 'delete') {
    return {
      type: 'world-card',
      operation: 'delete',
      entityId,
      changes: {},
      entryOps: [],
      newEntries: [],
      explanation: `删除世界「${worldData.name || entityId}」`,
    };
  }

  const isCreate = operation === 'create';

  const worldDataStr = isCreate
    ? '（新建世界，无现有数据）'
    : JSON.stringify(
        {
          id: worldData.id,
          name: worldData.name,
          system_prompt: worldData.system_prompt,
          post_prompt: worldData.post_prompt,
          temperature: worldData.temperature,
          max_tokens: worldData.max_tokens,
        },
        null,
        2,
      );

  const operationHint = isCreate
    ? '任务模式：**新建**。当前无世界数据，请从零生成所有字段。name（必填）、system_prompt（必填）、post_prompt（可为空字符串）、temperature（null 或 0.0-2.0）、max_tokens（null 或正整数）。输出 JSON 中 entityId 设为 null，operation 设为 "create"。'
    : '任务模式：**修改**。基于当前世界数据进行修改，changes 只包含需要修改的字段。';

  const existingEntriesStr = isCreate
    ? '[]'
    : JSON.stringify(
        (worldData.existingEntries || []).map((e) => ({
          id: e.id,
          title: e.title,
          summary: e.summary,
        })),
        null,
        2,
      );

  function serializeFields(arr) {
    return JSON.stringify(
      (arr || []).map((f) => ({ id: f.id, field_key: f.field_key, label: f.label, type: f.type, description: f.description })),
      null,
      2,
    );
  }

  const existingWorldStateFieldsStr = isCreate ? '[]' : serializeFields(worldData.existingWorldStateFields);
  const existingPersonaStateFieldsStr = isCreate ? '[]' : serializeFields(worldData.existingPersonaStateFields);
  const existingCharacterStateFieldsStr = isCreate ? '[]' : serializeFields(worldData.existingCharacterStateFields);

  const globalSystemPrompt = worldData._globalSystemPrompt || '（未设置）';

  const prompt = loadPrompt()
    .replace('{{GLOBAL_SYSTEM_PROMPT}}', globalSystemPrompt)
    .replace('{{WORLD_DATA}}', worldDataStr)
    .replace('{{EXISTING_ENTRIES}}', existingEntriesStr)
    .replace('{{EXISTING_WORLD_STATE_FIELDS}}', existingWorldStateFieldsStr)
    .replace('{{EXISTING_PERSONA_STATE_FIELDS}}', existingPersonaStateFieldsStr)
    .replace('{{EXISTING_CHARACTER_STATE_FIELDS}}', existingCharacterStateFieldsStr)
    .replace('{{OPERATION_HINT}}', operationHint)
    .replace('{{TASK}}', taskDesc)
    .replace('WORLD_ID_HERE', entityId ?? 'null');

  const messages = [{ role: 'user', content: prompt }];

  try {
    const raw = await llm.complete(messages, { temperature: isCreate ? 0.8 : 0.7, maxTokens: 8000 });
    const result = extractJson(raw);
    return {
      type: 'world-card',
      operation: result.operation ?? operation,
      entityId: result.entityId ?? entityId,
      changes: result.changes ?? {},
      entryOps: Array.isArray(result.entryOps) ? result.entryOps : [],
      stateFieldOps: Array.isArray(result.stateFieldOps) ? result.stateFieldOps : [],
      newEntries: (Array.isArray(result.entryOps) ? result.entryOps : Array.isArray(result.newEntries) ? result.newEntries : []).filter((e) => e.op === 'create' || !e.op),
      explanation: result.explanation ?? '已生成世界卡修改方案',
    };
  } catch (err) {
    throw new Error(`世界卡子代理失败：${err.message}`);
  }
}
