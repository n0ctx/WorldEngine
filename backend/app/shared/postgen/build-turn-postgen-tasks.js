import { getLatestTurnRecord } from '../../../db/queries/turn-records.js';
import { updateAllStates } from '../../../memory/combined-state-updater.js';
import { checkAndGenerateDiary } from '../../../memory/diary-generator.js';
import { generateDanmaku } from '../../../memory/danmaku-generator.js';
import { generateTitle } from '../../../memory/summarizer.js';
import { createTurnRecord, generateTurnIndex } from '../../../memory/turn-summarizer.js';
import { getConfig } from '../../../services/config.js';
import { buildLastTurnText, updateTableMemory } from '../../../services/table-memory.js';

/**
 * 一轮生成结束后的副模型任务清单，两种模式共用。
 *
 * 槽位顺序即执行顺序（同优先级下按 enqueue 先后），不可随意调整：
 * title(p2) → chapterTasks(p2) → all-state(p2) → table-memory(p2)
 * → turn-record(p2，blocksNextTurn) → danmaku(p2) → turn-index(p3) → diary(p4)。
 * turn-record 排在 table-memory 之后、danmaku 之前，依靠同优先级先进先出，
 * 保证它取快照时状态与表格已写完；blocksNextTurn 让下一轮开始前等它完成
 * （见 backend/utils/memory-commit-tracker.js）。
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
        await updateTableMemory(sessionId, buildLastTurnText(mode.postgen.lastTurnMessages(sessionId)), mode.id);
      },
      keepSseAlive: false,
    },
    {
      label: 'turn-record',
      priority: 2,
      fn: () => createTurnRecord(sessionId),
      blocksNextTurn: true,
      keepSseAlive: true,
    },
    {
      label: 'danmaku',
      priority: 2,
      condition: (mode.id === 'writing' ? getConfig().writing?.danmaku : getConfig().danmaku)?.enabled === true,
      fn: () => generateDanmaku(sessionId, { mode: mode.id }),
      sseEvent: 'danmaku',
      ssePayload: (comments) =>
        (Array.isArray(comments) && comments.length > 0 ? { type: 'danmaku', comments } : null),
      keepSseAlive: true,
    },
    {
      label: 'turn-index',
      priority: 3,
      fn: () => generateTurnIndex(sessionId),
      keepSseAlive: false,
    },
    {
      label: 'diary',
      priority: 4,
      fn: async () => {
        const latest = getLatestTurnRecord(sessionId);
        if (latest) await checkAndGenerateDiary(sessionId, latest.round_index);
      },
      sseEvent: 'diary_updated',
      ssePayload: () => ({ type: 'diary_updated' }),
      keepSseAlive: true,
    },
  ];
}
