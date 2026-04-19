/**
 * 玩家卡子代理
 * 输入：taskObj（{ task, operation, entityId }）、personaData（当前玩家数据）
 * 输出：{ type, operation, entityId, changes, stateFieldOps, explanation }
 * operation 只支持 'update'（persona 是 upsert，无 create/delete）
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../../backend/llm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt() {
  return readFileSync(
    path.resolve(__dirname, '../../prompts/sub-persona-card.md'),
    'utf-8',
  );
}

/**
 * @param {string|object} taskObj    任务描述字符串，或 { task, operation, entityId }
 * @param {object} personaData       当前玩家数据（含 existingPersonaStateFields）
 * @param {object} _context          附加上下文（可选）
 * @returns {Promise<object>} 结构化提案
 */
export async function processPersonaCard(taskObj, personaData, _context) {
  const taskDesc = typeof taskObj === 'string' ? taskObj : (taskObj.task ?? '');
  const entityId = (typeof taskObj === 'object' ? taskObj.entityId : null) ?? personaData.world_id ?? null;

  const personaDataStr = JSON.stringify(
    {
      world_id: personaData.world_id,
      name: personaData.name,
      system_prompt: personaData.system_prompt,
    },
    null,
    2,
  );

  const operationHint = '任务模式：**修改**。玩家卡是 upsert 模式，直接填写需要更新的字段即可。若玩家卡尚无内容，可从零生成 name 和 system_prompt。';

  const existingPersonaStateFieldsStr = JSON.stringify(
    (personaData.existingPersonaStateFields || []).map((f) => ({
      id: f.id,
      field_key: f.field_key,
      label: f.label,
      type: f.type,
      description: f.description,
    })),
    null,
    2,
  );

  const prompt = loadPrompt()
    .replace('{{PERSONA_DATA}}', personaDataStr)
    .replace('{{EXISTING_PERSONA_STATE_FIELDS}}', existingPersonaStateFieldsStr)
    .replace('{{OPERATION_HINT}}', operationHint)
    .replace('{{TASK}}', taskDesc)
    .replace('WORLD_ID_HERE', entityId ?? 'null');

  const messages = [{ role: 'user', content: prompt }];

  try {
    const raw = await llm.complete(messages, { temperature: 0.8, maxTokens: 4000 });
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('子代理输出格式错误');
    const result = JSON.parse(match[0]);
    return {
      type: 'persona-card',
      operation: 'update',
      entityId: result.entityId ?? entityId,
      changes: result.changes ?? {},
      stateFieldOps: Array.isArray(result.stateFieldOps) ? result.stateFieldOps : [],
      explanation: result.explanation ?? '已生成玩家卡修改方案',
    };
  } catch (err) {
    throw new Error(`玩家卡子代理失败：${err.message}`);
  }
}
