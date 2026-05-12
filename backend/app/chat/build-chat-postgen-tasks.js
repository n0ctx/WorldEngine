import { getLatestTurnRecord } from '../../db/queries/turn-records.js';
import { createTurnRecord } from '../../memory/turn-summarizer.js';
import { updateAllStates } from '../../memory/combined-state-updater.js';
import { generateTitle } from '../../memory/summarizer.js';
import { checkAndGenerateDiary } from '../../memory/diary-generator.js';

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
