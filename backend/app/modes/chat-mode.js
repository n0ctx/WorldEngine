import { getConfig } from '../../services/config.js';
import { getCharacterById } from '../../services/characters.js';
import { getWorldById } from '../../services/worlds.js';
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

  llm: {
    // 主模型无需 configScope；callType 只用于日志与用量归类
    configScope: undefined,
    callType: { stream: 'main_answer', continue: 'main_continue', impersonate: 'impersonate' },
    prefillProvider: () => getConfig()?.llm?.provider,
  },

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

  impersonate: {
    promptOptions: () => ({}),
    // 代拟是短任务，对话侧一直显式关闭扩展思考
    disableThinking: true,
    maxTokens: (overrides) => overrides.maxTokens ?? 1000,
    /** 代拟需要玩家卡所在世界；对话会话经角色间接拿到 */
    resolveWorldId(req, session) {
      const character = session.character_id ? getCharacterById(session.character_id) : null;
      const world = character?.world_id ? getWorldById(character.world_id) : null;
      if (!character || !world) {
        return { worldId: null, status: 400, error: 'Session is missing character/world context' };
      }
      return { worldId: world.id };
    },
  },

  postgen: {
    titleLabel: 'title',
    tableMemoryEnabled: () => getConfig().table_memory_enabled === true,
    lastTurnMessages: (sessionId) => getLastTurnMessages(sessionId),
    /** 章节标题是写作专属，对话模式没有这个槽位 */
    chapterTasks: () => [],
  },
};
