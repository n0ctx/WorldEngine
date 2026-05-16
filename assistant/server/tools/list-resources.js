// assistant/server/tools/list-resources.js
import { getAllWorlds } from '../../../backend/db/queries/worlds.js';
import { getCharactersByWorldId, getAllCharacters } from '../../../backend/db/queries/characters.js';
import { listPersonas } from '../../../backend/services/personas.js';
import { getAllPersonas } from '../../../backend/db/queries/personas.js';
import { listCustomCssSnippets } from '../../../backend/db/queries/custom-css-snippets.js';
import { listRegexRules } from '../../../backend/db/queries/regex-rules.js';
import { listThemes } from '../../../backend/services/themes.js';

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
      '跨世界 / 跨角色的列表查询。target 选择资源类型；characters / personas 的 worldId 可选，省略则返回所有世界。' +
      'preview_card 用于查单个实体的完整详情，list_resources 用于发现"有哪些"。',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', enum: ['worlds', 'characters', 'personas', 'css-snippets', 'regex-rules', 'themes'] },
        worldId: { type: 'string', description: 'characters / personas 时可选：限定世界；省略则返回所有世界' },
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
      if (!worldId) return JSON.stringify(trim(getAllCharacters()));
      return JSON.stringify(trim(getCharactersByWorldId(worldId)));
    }
    case 'personas': {
      if (!worldId) return JSON.stringify(trim(getAllPersonas()));
      return JSON.stringify(trim(listPersonas(worldId)));
    }
    case 'css-snippets':
      return JSON.stringify(trim(listCustomCssSnippets()));
    case 'regex-rules':
      return JSON.stringify(trim(listRegexRules()));
    case 'themes':
      return JSON.stringify(trim(listThemes().themes));
    default:
      throw new Error(`未知 target: ${target}`);
  }
}
