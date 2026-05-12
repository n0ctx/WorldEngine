import { deleteDailyEntriesAfterRound, getDailyEntriesAfterRound } from '../../../db/queries/daily-entries.js';
import {
  deleteTurnRecordsAfterRound,
  getLatestTurnRecord,
  getLatestTurnRecordWithSnapshot,
} from '../../../db/queries/turn-records.js';
import { clearPending, waitForQueueIdle } from '../../../utils/async-queue.js';
import { ALL_MESSAGES_LIMIT } from '../../../utils/constants.js';
import { createLogger, formatMeta } from '../../../utils/logger.js';
import { restoreStateFromSnapshot } from '../../../memory/state-rollback.js';
import { deleteDiaryFile } from '../../../memory/diary-generator.js';
import { getCharacterById } from '../../../services/characters.js';
import { restoreLtmFromTurnRecord } from '../../../services/long-term-memory.js';
import {
  deleteMessagesAfter,
  getMessagesBySessionId,
  getSessionById,
} from '../../../services/sessions.js';

const log = createLogger('chat');

export async function rollbackChatSession(sessionId, afterMessageId) {
  await waitForQueueIdle(sessionId);
  await deleteMessagesAfter(afterMessageId);

  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const roundCount = remaining.filter((message) => message.role === 'user').length;

  deleteTurnRecordsAfterRound(sessionId, roundCount - 1);
  log.info(
    `TURN-RECORD TRUNCATE  ${formatMeta({
      session: sessionId.slice(0, 8),
      keepUntilRound: Math.max(0, roundCount - 1),
    })}`
  );

  restoreLtmFromTurnRecord(
    sessionId,
    roundCount === 0 ? null : getLatestTurnRecord(sessionId)
  );

  const diaryEntries = getDailyEntriesAfterRound(sessionId, roundCount);
  for (const entry of diaryEntries) {
    deleteDiaryFile(sessionId, entry.date_str);
  }
  deleteDailyEntriesAfterRound(sessionId, roundCount);

  clearPending(sessionId, 4);
  log.info(
    `QUEUE CLEAR  ${formatMeta({
      session: sessionId.slice(0, 8),
      threshold: 4,
    })}`
  );

  const session = getSessionById(sessionId);
  const characterId = session?.character_id;
  const character = characterId ? getCharacterById(characterId) : null;
  const worldId = character?.world_id ?? null;

  if (!worldId) {
    return { stateRolledBack: false };
  }

  const lastRecord = getLatestTurnRecordWithSnapshot(sessionId);
  restoreStateFromSnapshot(
    sessionId,
    worldId,
    characterId ? [characterId] : [],
    lastRecord?.state_snapshot ? JSON.parse(lastRecord.state_snapshot) : null
  );
  log.info(
    `STATE ROLLBACK  ${formatMeta({
      session: sessionId.slice(0, 8),
      hasSnapshot: !!lastRecord?.state_snapshot,
    })}`
  );

  return { stateRolledBack: true };
}
