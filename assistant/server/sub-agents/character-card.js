/**
 * 角色卡子代理
 * 输入：taskObj（{ task, operation, entityId }）、characterData（当前角色完整数据）
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
    path.resolve(__dirname, '../../prompts/sub-character-card.md'),
    'utf-8',
  );
}

/**
 * @param {string|object} taskObj    任务描述字符串，或 { task, operation, entityId }
 * @param {object} characterData     当前角色数据（create 时为空对象 {}）
 * @param {object} _context          附加上下文（可选）
 * @returns {Promise<object>} 结构化提案
 */
export async function processCharacterCard(taskObj, characterData, _context) {
  const taskDesc = typeof taskObj === 'string' ? taskObj : (taskObj.task ?? '');
  const operation = typeof taskObj === 'object' ? (taskObj.operation ?? 'update') : 'update';
  const entityId = (typeof taskObj === 'object' ? taskObj.entityId : null) ?? characterData.id ?? null;

  // delete 不调用 LLM，直接返回删除提案
  if (operation === 'delete') {
    return {
      type: 'character-card',
      operation: 'delete',
      entityId,
      changes: {},
      entryOps: [],
      newEntries: [],
      explanation: `删除角色「${characterData.name || entityId}」`,
    };
  }

  const isCreate = operation === 'create';

  const characterDataStr = isCreate
    ? '（新建角色，无现有数据）'
    : JSON.stringify(
        {
          id: characterData.id,
          name: characterData.name,
          system_prompt: characterData.system_prompt,
          post_prompt: characterData.post_prompt,
          first_message: characterData.first_message,
        },
        null,
        2,
      );

  const operationHint = isCreate
    ? '任务模式：**新建**。当前无角色数据，请从零生成所有字段。name（必填）、system_prompt（必填）、post_prompt（可为空字符串）、first_message（建议填写，体现角色特色）。输出 JSON 中 entityId 设为 null，operation 设为 "create"。'
    : '任务模式：**修改**。基于当前角色数据进行修改，changes 只包含需要修改的字段。';

  const existingEntriesStr = isCreate
    ? '[]'
    : JSON.stringify(
        (characterData.existingEntries || []).map((e) => ({
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

  const existingCharacterStateFieldsStr = isCreate ? '[]' : serializeFields(characterData.existingCharacterStateFields);
  const existingPersonaStateFieldsStr = isCreate ? '[]' : serializeFields(characterData.existingPersonaStateFields);

  const globalSystemPrompt = characterData._globalSystemPrompt || '（未设置）';
  const worldSystemPrompt = characterData._worldSystemPrompt || '（未设置）';

  const prompt = loadPrompt()
    .replace('{{GLOBAL_SYSTEM_PROMPT}}', globalSystemPrompt)
    .replace('{{WORLD_SYSTEM_PROMPT}}', worldSystemPrompt)
    .replace('{{CHARACTER_DATA}}', characterDataStr)
    .replace('{{EXISTING_ENTRIES}}', existingEntriesStr)
    .replace('{{EXISTING_CHARACTER_STATE_FIELDS}}', existingCharacterStateFieldsStr)
    .replace('{{EXISTING_PERSONA_STATE_FIELDS}}', existingPersonaStateFieldsStr)
    .replace('{{OPERATION_HINT}}', operationHint)
    .replace('{{TASK}}', taskDesc)
    .replace('CHARACTER_ID_HERE', entityId ?? 'null');

  const messages = [{ role: 'user', content: prompt }];

  try {
    const raw = await llm.complete(messages, { temperature: 0.8, maxTokens: 6000 });
    const result = extractJson(raw);
    return {
      type: 'character-card',
      operation: result.operation ?? operation,
      entityId: result.entityId ?? entityId,
      changes: result.changes ?? {},
      entryOps: Array.isArray(result.entryOps) ? result.entryOps : [],
      stateFieldOps: Array.isArray(result.stateFieldOps) ? result.stateFieldOps : [],
      newEntries: (Array.isArray(result.entryOps) ? result.entryOps : Array.isArray(result.newEntries) ? result.newEntries : []).filter((e) => e.op === 'create' || !e.op),
      explanation: result.explanation ?? '已生成角色卡修改方案',
    };
  } catch (err) {
    throw new Error(`角色卡子代理失败：${err.message}`);
  }
}
