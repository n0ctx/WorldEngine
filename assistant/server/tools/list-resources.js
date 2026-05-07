// assistant/server/tools/list-resources.js
import { getAllWorlds } from '../../../backend/db/queries/worlds.js';
import { getCharactersByWorldId } from '../../../backend/db/queries/characters.js';
import { listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { listRegexRules } from '../../../backend/db/queries/regex-rules.js';

const MAX = 200;

function trim(rows) {
  if (!Array.isArray(rows)) return rows;
  if (rows.length <= MAX) return rows;
  return { _truncated: true, total: rows.length, limit: MAX, data: rows.slice(0, MAX) };
}

export const definition = {
  type: 'function',
  function: {
    name: 'list_resources',
    description:
      '跨世界 / 跨角色的列表查询。target 选择资源类型；characters 必须传 worldId（或省略代表所有世界）。' +
      'preview_card 用于查单个实体的完整详情，list_resources 用于发现"有哪些"。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['worlds', 'characters', 'css-snippets', 'regex-rules'] },
        worldId: { type: 'string', description: 'characters 时可传：限定世界；省略返回全部' },
      },
      required: ['target'],
    },
  },
};

export async function execute({ target, worldId }) {
  switch (target) {
    case 'worlds':
      return JSON.stringify(trim(getAllWorlds()));
    case 'characters': {
      // 项目暂未提供 listCharactersAll；按 worldId 必传处理
      if (!worldId) throw new Error('characters target 需要 worldId');
      return JSON.stringify(trim(getCharactersByWorldId(worldId)));
    }
    case 'css-snippets':
      return JSON.stringify(trim(listCustomCssSnippets()));
    case 'regex-rules':
      return JSON.stringify(trim(listRegexRules()));
    default:
      throw new Error(`未知 target: ${target}`);
  }
}
