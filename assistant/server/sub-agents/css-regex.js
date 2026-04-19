/**
 * CSS + 正则子代理
 * 输入：task（任务描述）
 * 输出：{ type, operation, changes, explanation }
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as llm from '../../../backend/llm/index.js';
import { extractJson } from './extract-json.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadPrompt() {
  return readFileSync(
    path.resolve(__dirname, '../../prompts/sub-css-regex.md'),
    'utf-8',
  );
}

/**
 * @param {string} task    主代理描述的任务
 * @param {object} _data   未使用（CSS/正则不需要当前实体数据）
 * @returns {Promise<object>} 结构化提案
 */
export async function processCssRegex(taskObj, _data, _context) {
  const task = typeof taskObj === 'string' ? taskObj : (taskObj.task ?? '');
  const prompt = loadPrompt().replace('{{TASK}}', task);
  const messages = [{ role: 'user', content: prompt }];

  try {
    const raw = await llm.complete(messages, { temperature: 0.3, maxTokens: 1500 });
    const result = extractJson(raw);

    // 校验 type 字段
    if (!['css-snippet', 'regex-rule'].includes(result.type)) {
      throw new Error(`未知的提案类型：${result.type}`);
    }

    // 校验 regex scope
    if (result.type === 'regex-rule') {
      const validScopes = ['user_input', 'ai_output', 'display_only', 'prompt_only'];
      if (!validScopes.includes(result.changes?.scope)) {
        result.changes = { ...result.changes, scope: 'display_only' };
      }
    }

    return {
      type: result.type,
      operation: result.operation ?? 'create',
      changes: result.changes ?? {},
      explanation: result.explanation ?? '已生成修改方案',
    };
  } catch (err) {
    throw new Error(`CSS/正则子代理失败：${err.message}`);
  }
}
