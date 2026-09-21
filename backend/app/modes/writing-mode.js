import { getChapterTitle, upsertChapterTitle } from '../../db/queries/chapter-titles.js';
import { getLastTurnMessages } from '../../db/queries/messages.js';
import { generateChapterTitle } from '../../memory/chapter-title-generator.js';
import { getConfig, getEffectiveChapterTurnSize } from '../../services/config.js';
import {
  createMessage,
  deleteMessagesAfter,
  getMessagesBySessionId,
  getWritingSessionById,
  touchWritingSession,
} from '../../services/writing-sessions.js';
import { detectNewChapter } from '../../utils/chapter-detector.js';
import { createLogger } from '../../utils/logger.js';

/** 写作模式描述符；依赖方向约束同 chat-mode.js */
export const writingMode = {
  id: 'writing',
  log: createLogger('writing'),

  auxScope: 'writing-aux',
  suggestionEnabled: () => !!getConfig().writing?.suggestion_enabled,

  session: {
    getById: getWritingSessionById,
    touch: touchWritingSession,
    createMessage,
    getMessages: getMessagesBySessionId,
    deleteMessagesAfter,
  },

  /** 写作会话没有固定角色，世界直接挂在 session 上 */
  resolveScope(sessionId) {
    const session = getWritingSessionById(sessionId);
    return {
      session,
      characterId: null,
      worldId: session?.world_id ?? null,
      characterIds: [],
    };
  },

  postgen: {
    titleLabel: 'session-title',
    tableMemoryEnabled: () => getConfig().writing?.table_memory_enabled === true,
    lastTurnMessages: (sessionId) => getLastTurnMessages(sessionId),

    /**
     * 章节标题槽位：仅在本轮跨入新章、且该章尚无标题时入队。
     * 先落一个默认标题占位，避免副模型失败后章节无名。
     */
    chapterTasks({ sessionId, messages, turnRecordOpts, includeChapterTitle }) {
      if (!includeChapterTitle || turnRecordOpts?.isUpdate) return [];
      const newChapter = detectNewChapter(messages, getEffectiveChapterTurnSize('writing'));
      if (!newChapter) return [];

      const { chapterIndex, chapterMessages } = newChapter;
      if (getChapterTitle(sessionId, chapterIndex)) return [];
      upsertChapterTitle(sessionId, chapterIndex, chapterIndex === 1 ? '序章' : '续章', 1);

      return [{
        label: 'chapter-title',
        priority: 2,
        fn: () => generateChapterTitle(sessionId, chapterIndex, chapterMessages),
        sseEvent: 'chapter_title_updated',
        ssePayload: (title) => (title ? { type: 'chapter_title_updated', chapterIndex, title } : null),
        keepSseAlive: true,
      }];
    },
  },
};
