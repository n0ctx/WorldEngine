import { getLatestTurnRecord } from '../../../db/queries/turn-records.js';
import { updateAllStates } from '../../../memory/combined-state-updater.js';
import { checkAndGenerateDiary } from '../../../memory/diary-generator.js';
import { generateDanmaku } from '../../../memory/danmaku-generator.js';
import { generateTitle } from '../../../memory/summarizer.js';
import { createTurnRecord } from '../../../memory/turn-summarizer.js';
import { getConfig } from '../../../services/config.js';
import { buildLastTurnText, updateTableMemory } from '../../../services/table-memory.js';

/**
 * 一轮生成结束后的副模型任务清单，两种模式共用。
 *
 * 槽位顺序即执行顺序（同优先级下按 enqueue 先后），不可随意调整：
 * 写作模式原本就是 session-title 紧跟 chapter-title。
 *
 * label 是对外契约（hooks/README.md 的「内置任务 label 参考」），不可改名。
 */
export function buildTurnPostgenTasks({
  mode,
  sessionId,
  worldId,
  characterIds = [],
  session,
  messages = [],
  turnRecordOpts = {},
  includeSessionTitle = true,
  includeChapterTitle = true,
}) {
  return [
    {
      label: mode.postgen.titleLabel,
      priority: 2,
      fn: () => generateTitle(sessionId),
      condition: includeSessionTitle && !!(session && !session.title),
      sseEvent: 'title_updated',
      ssePayload: (title) => (title ? { type: 'title_updated', title } : null),
      keepSseAlive: true,
    },

    ...mode.postgen.chapterTasks({ sessionId, messages, turnRecordOpts, includeChapterTitle }),

    {
      label: 'all-state',
      priority: 2,
      fn: () => updateAllStates(worldId, characterIds, sessionId),
      tracksState: true,
      startSseEvent: 'state_queued',
      sseEvent: 'state_updated',
      ssePayload: () => ({ type: 'state_updated' }),
      keepSseAlive: true,
    },
    {
      label: 'table-memory',
      priority: 2,
      condition: mode.postgen.tableMemoryEnabled(),
      // 统一从 DB 取本轮最后一问一答：写作续写原本传的是空数组，表格记忆拿不到任何文本
      fn: async () => {
        await updateTableMemory(sessionId, buildLastTurnText(mode.postgen.lastTurnMessages(sessionId)));
      },
      keepSseAlive: false,
    },
    {
      label: 'danmaku',
      priority: 2,
      condition: getConfig().danmaku?.enabled === true,
      fn: () => generateDanmaku(sessionId, { mode: mode.id }),
      sseEvent: 'danmaku',
      ssePayload: (comments) =>
        (Array.isArray(comments) && comments.length > 0 ? { type: 'danmaku', comments } : null),
      keepSseAlive: true,
    },
    {
      label: 'turn-record',
      priority: 3,
      fn: () => createTurnRecord(sessionId, turnRecordOpts),
      keepSseAlive: false,
    },
    {
      label: 'diary',
      priority: 4,
      fn: async () => {
        const latest = getLatestTurnRecord(sessionId);
        if (latest) await checkAndGenerateDiary(sessionId, latest.round_index);
      },
      // 取两侧并集：isUpdate 守卫来自对话侧（编辑回复时不重复生成日记），
      // diary_updated 事件来自写作侧（前端据此刷新日记面板）
      condition: !turnRecordOpts?.isUpdate,
      sseEvent: 'diary_updated',
      ssePayload: () => ({ type: 'diary_updated' }),
      keepSseAlive: true,
    },
  ];
}
