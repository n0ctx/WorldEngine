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
import { getSessionStateBaseline } from '../../../db/queries/sessions.js';

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

  // 优先用残留轮次快照；回滚到零残留（重生成首轮）时退回首轮前基线
  // （保住手动预设、丢弃被重生成轮次的污染）；二者皆无（老会话）才保留现状。
  const lastRecord = getLatestTurnRecordWithSnapshot(sessionId);
  const snapshotJson = lastRecord?.state_snapshot ?? getSessionStateBaseline(sessionId);
  restoreStateFromSnapshot(
    sessionId,
    worldId,
    characterId ? [characterId] : [],
    snapshotJson ? JSON.parse(snapshotJson) : null
  );
  log.info(
    `STATE ROLLBACK  ${formatMeta({
      session: sessionId.slice(0, 8),
      hasSnapshot: !!lastRecord?.state_snapshot,
      fromBaseline: !lastRecord?.state_snapshot && !!snapshotJson,
    })}`
  );

  return { stateRolledBack: true };
}
