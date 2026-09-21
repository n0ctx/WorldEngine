import { getConfig } from '../../services/config.js';
import { getCharacterById } from '../../services/characters.js';
import {
  createMessage,
  deleteMessagesAfter,
  getMessagesBySessionId,
  getSessionById,
  touchSession,
} from '../../services/sessions.js';
import { getLastTurnMessages } from '../../db/queries/messages.js';
import { createLogger } from '../../utils/logger.js';

/**
 * 对话模式描述符 —— 回合管线的所有模式差异都收敛在这里。
 * 只允许向下依赖 services / db/queries / memory；不得依赖 app/turn 与 app/shared，否则成环。
 */
export const chatMode = {
  id: 'chat',
  log: createLogger('chat'),

  auxScope: 'aux',
  suggestionEnabled: () => !!getConfig().suggestion_enabled,

  session: {
    getById: getSessionById,
    touch: touchSession,
    createMessage,
    getMessages: getMessagesBySessionId,
    deleteMessagesAfter,
  },

  /** rollback / postgen / edit-assistant 三处共用的世界与角色解析 */
  resolveScope(sessionId) {
    const session = getSessionById(sessionId);
    const characterId = session?.character_id ?? null;
    const character = characterId ? getCharacterById(characterId) : null;
    return {
      session,
      characterId,
      worldId: character?.world_id ?? null,
      characterIds: characterId ? [characterId] : [],
    };
  },

  postgen: {
    titleLabel: 'title',
    tableMemoryEnabled: () => getConfig().table_memory_enabled === true,
    lastTurnMessages: (sessionId) => getLastTurnMessages(sessionId),
    /** 章节标题是写作专属，对话模式没有这个槽位 */
    chapterTasks: () => [],
  },
};
