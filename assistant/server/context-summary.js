// 把一段对话（含工具调用与结果）压成摘要，供写卡助手丢掉原文后接着工作。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as llm from '../../backend/llm/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPACT_PROMPT_PATH = path.resolve(__dirname, '../prompts/compact.md');

// 单条工具参数 / 结果在摘要请求里保留的字符数：新建资源的 ref 在结果开头，保留开头即可
const TOOL_ARGS_CLIP = 1500;
const TOOL_RESULT_CLIP = 2000;
const SUMMARY_MAX_TOKENS = 8192;

function clip(text, limit) {
  return text.length > limit ? `${text.slice(0, limit)}…（已截断）` : text;
}

function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map((part) => (typeof part?.text === 'string' ? part.text : '')).join('');
  return content == null ? '' : JSON.stringify(content);
}

/** 非 system 消息 → 带角色标记的文本；工具结果按 tool_call_id 对回工具名 */
function serializeForSummary(messages) {
  const toolNames = new Map();
  const lines = [];
  for (const m of messages) {
    if (m.role === 'user') {
      lines.push(`[用户] ${textOf(m.content)}`);
    } else if (m.role === 'assistant') {
      const text = textOf(m.content).trim();
      if (text) lines.push(`[助手] ${text}`);
      for (const call of m.tool_calls ?? []) {
        toolNames.set(call.id, call.function?.name);
        lines.push(`[调用] ${call.function?.name} ${clip(String(call.function?.arguments ?? ''), TOOL_ARGS_CLIP)}`);
      }
    } else if (m.role === 'tool') {
      lines.push(`[结果] ${toolNames.get(m.tool_call_id) ?? ''} ${clip(textOf(m.content), TOOL_RESULT_CLIP)}`);
    }
  }
  return lines.join('\n\n');
}

function extractSummary(output) {
  const tagged = /<summary>([\s\S]*?)<\/summary>/.exec(output)?.[1];
  return (tagged ?? output.replace(/<analysis>[\s\S]*?<\/analysis>/, '')).trim();
}

/**
 * 生成摘要。previousSummary 是更早一次压缩留下的摘要，会被并入新摘要。
 */
export async function summarizeContext({ previousSummary, messages, configScope, signal }) {
  const prompt = (await readFile(COMPACT_PROMPT_PATH, 'utf-8')).trim();
  const sections = [
    ...(previousSummary ? [`# 先前摘要\n${previousSummary}`] : []),
    `# 需要并入的新对话\n${serializeForSummary(messages)}`,
  ];
  const output = String(await llm.complete([
    { role: 'system', content: prompt },
    { role: 'user', content: sections.join('\n\n') },
  ], {
    temperature: 0.2,
    thinking_level: null,
    maxTokens: SUMMARY_MAX_TOKENS,
    configScope,
    callType: 'assistant-summary',
    signal,
  }) ?? '');
  return extractSummary(output);
}

// 摘要并入唯一的 system 消息：部分本地模型的对话模板只允许一条且必须在最前。
export function withSummary(systemPrompt, summary) {
  return summary ? `${systemPrompt}\n\n# 更早对话的摘要\n${summary}` : systemPrompt;
}
