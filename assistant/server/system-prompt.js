// 写卡助手的系统提示词：固定提示词 + 参考文档清单 + 当前位置；以及本轮工作所在的世界。

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getWorldById } from '../../backend/services/worlds.js';
import { getCharacterById } from '../../backend/db/queries/characters.js';
import { listDocs } from './workspace/docs.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = path.resolve(__dirname, '../prompts/system.md');

function describeLocation(session) {
  const world = session.worldId ? getWorldById(session.worldId) : null;
  const character = session.characterId ? getCharacterById(session.characterId) : null;
  return [
    '# 当前位置',
    world ? `- 当前世界：world:${world.id}（${world.name}）` : '- 当前未选中世界',
    ...(character ? [`- 当前角色：character:${character.id}（${character.name}）`] : []),
  ].join('\n');
}

export async function buildSystemPrompt(session) {
  const prompt = await readFile(PROMPT_PATH, 'utf-8');
  return [prompt.trim(), '# 参考文档（动手前先 read 对应的那份）', listDocs().join('\n'), describeLocation(session)].join('\n\n');
}

// 之前轮次里新建的世界仍然存在时，继续作为当前世界；否则用面板所在的世界。
export function resolveWorkingWorldId(task) {
  const messages = Array.isArray(task.messages) ? task.messages : [];
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    if (m?.role !== 'tool_call' || m.toolName !== 'create' || m.target !== 'world' || m.status !== 'done') continue;
    const worldId = /world:([\w-]+)/.exec(m.result ?? '')?.[1];
    if (worldId && getWorldById(worldId)) return worldId;
  }
  return task.context?.worldId ?? null;
}
