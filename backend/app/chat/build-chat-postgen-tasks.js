import { getLatestTurnRecord } from '../../db/queries/turn-records.js';
import { getMessagesBySessionId } from '../../db/queries/messages.js';
import { createTurnRecord } from '../../memory/turn-summarizer.js';
import { updateAllStates } from '../../memory/combined-state-updater.js';
import { generateTitle } from '../../memory/summarizer.js';
import { checkAndGenerateDiary } from '../../memory/diary-generator.js';
import { updateTableMemory } from '../../services/table-memory.js';
import { getConfig } from '../../services/config.js';
import { ALL_MESSAGES_LIMIT } from '../../utils/constants.js';

export function buildChatPostgenTasks({
  sessionId,
  worldId,
  characterId,
  session,
  turnRecordOpts = {},
}) {
  return [
    {
      label: 'title',
      priority: 2,
      fn: () => generateTitle(sessionId),
      condition: !!(session && !session.title),
      sseEvent: 'title_updated',
      ssePayload: (title) => (title ? { type: 'title_updated', title } : null),
      keepSseAlive: true,
    },
    {
      label: 'all-state',
      priority: 2,
      fn: () => updateAllStates(worldId, characterId ? [characterId] : [], sessionId),
      tracksState: true,
      startSseEvent: 'state_queued',
      sseEvent: 'state_updated',
      ssePayload: () => ({ type: 'state_updated' }),
      keepSseAlive: true,
    },
    {
      label: 'table-memory',
      priority: 2,
      condition: getConfig().table_memory_enabled === true,
      fn: async () => {
        const msgs = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
        const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
        const lastAsst = [...msgs].reverse().find((m) => m.role === 'assistant');
        const turnText = [lastUser?.content, lastAsst?.content].filter(Boolean).join('\n');
        await updateTableMemory(sessionId, turnText);
      },
      keepSseAlive: false,
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
      condition: !turnRecordOpts?.isUpdate,
      keepSseAlive: false,
    },
  ];
}
