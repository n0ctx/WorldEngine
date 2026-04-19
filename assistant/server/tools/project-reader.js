/**
 * 写卡助手 read_file 工具
 * 允许 LLM 读取项目仓库内的文件，用于查阅文档以提高生成准确性。
 * 路径范围严格限定在项目根目录内，禁止目录遍历。
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// tools/ → server/ → assistant/ → 项目根目录
const PROJECT_ROOT = path.resolve(__dirname, '../../../');
const MAX_FILE_BYTES = 50_000; // 50 KB 截断上限

export function executeReadFile({ path: filePath }) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    return '错误：路径不能为空';
  }
  const normalized = filePath.trim();
  const resolved = path.resolve(PROJECT_ROOT, normalized);

  // 安全检查：必须在项目根目录内
  if (!resolved.startsWith(PROJECT_ROOT + path.sep) && resolved !== PROJECT_ROOT) {
    return `错误：路径 "${normalized}" 超出项目范围`;
  }

  if (!existsSync(resolved)) {
    return `错误：文件不存在："${normalized}"`;
  }

  try {
    const content = readFileSync(resolved, 'utf-8');
    if (Buffer.byteLength(content, 'utf-8') > MAX_FILE_BYTES) {
      return content.slice(0, MAX_FILE_BYTES) + '\n\n[已截断，仅显示前 50 KB]';
    }
    return content;
  } catch (e) {
    return `错误：无法读取文件 "${normalized}"：${e.message}`;
  }
}

export const READ_FILE_TOOL = {
  type: 'function',
  function: {
    name: 'read_file',
    description:
      '读取项目仓库中的文件内容。可用于查阅 assistant/CONTRACT.md、SCHEMA.md、ARCHITECTURE.md 等文档，' +
      '以确认字段名称、JSON 格式和约束，提高生成的提案准确性。',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: '相对于项目根目录的文件路径，如 "assistant/CONTRACT.md"、"SCHEMA.md"',
        },
      },
      required: ['path'],
    },
  },
  execute: executeReadFile,
};

/** 供子代理和主代理使用的工具列表 */
export const PROJECT_TOOLS = [READ_FILE_TOOL];
