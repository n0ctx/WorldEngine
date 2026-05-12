import { deleteDailyEntriesAfterRound, getDailyEntriesAfterRound } from '../../../db/queries/daily-entries.js';
import {
  deleteTurnRecordsAfterRound,
  getLatestTurnRecord,
  getLatestTurnRecordWithSnapshot,
} from '../../../db/queries/turn-records.js';
import { clearPending, waitForQueueIdle } from '../../../utils/async-queue.js';
import { ALL_MESSAGES_LIMIT } from '../../../utils/constants.js';
import { restoreStateFromSnapshot } from '../../../memory/state-rollback.js';
import { deleteDiaryFile } from '../../../memory/diary-generator.js';
import { restoreLtmFromTurnRecord } from '../../../services/long-term-memory.js';
import {
  deleteMessagesAfter,
  getMessagesBySessionId,
  getWritingSessionById,
} from '../../../services/writing-sessions.js';

export async function rollbackWritingSession(sessionId, afterMessageId) {
  await waitForQueueIdle(sessionId);
  await deleteMessagesAfter(afterMessageId);

  const remaining = getMessagesBySessionId(sessionId, ALL_MESSAGES_LIMIT, 0);
  const roundCount = remaining.filter((message) => message.role === 'user').length;

  deleteTurnRecordsAfterRound(sessionId, roundCount - 1);
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

  const session = getWritingSessionById(sessionId);
  const worldId = session?.world_id ?? null;
  if (!worldId) {
    return { stateRolledBack: false };
  }

  const lastRecord = getLatestTurnRecordWithSnapshot(sessionId);
  restoreStateFromSnapshot(
    sessionId,
    worldId,
    [],
    lastRecord?.state_snapshot ? JSON.parse(lastRecord.state_snapshot) : null
  );

  return { stateRolledBack: true };
}
