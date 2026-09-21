import { deleteDailyEntriesAfterRound, getDailyEntriesAfterRound } from '../../../db/queries/daily-entries.js';
import {
  deleteTurnRecordsAfterRound,
  getLatestTurnRecord,
  getLatestTurnRecordWithSnapshot,
} from '../../../db/queries/turn-records.js';
import { getSessionStateBaseline } from '../../../db/queries/sessions.js';
import { clearPending, waitForQueueIdle } from '../../../utils/async-queue.js';
import { ALL_MESSAGES_LIMIT } from '../../../utils/constants.js';
import { formatMeta } from '../../../utils/logger.js';
import { restoreStateFromSnapshot } from '../../../memory/state-rollback.js';
import { deleteDiaryFile } from '../../../memory/diary-generator.js';
import { restoreLtmFromTurnRecord } from '../../../services/long-term-memory.js';
import { restoreTablesFromTurnRecord } from '../../../services/table-memory.js';

/**
 * 回滚一个会话到 afterMessageId 之后的状态：截断消息与轮次记录，
 * 还原长期记忆 / 表格记忆 / 日记 / 状态快照。
 *
 * 模式差异只剩「世界与角色怎么解析」，由 mode.resolveScope 吃掉。
 */
export async function rollbackSession(mode, sessionId, afterMessageId) {
  const log = mode.log;
  const sid = sessionId.slice(0, 8);

  await waitForQueueIdle(sessionId);
  await mode.session.deleteMessagesAfter(afterMessageId);

  const remaining = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
  const roundCount = remaining.filter((message) => message.role === 'user').length;

  deleteTurnRecordsAfterRound(sessionId, roundCount - 1);
  log.info(`TURN-RECORD TRUNCATE  ${formatMeta({ session: sid, keepUntilRound: Math.max(0, roundCount - 1) })}`);

  restoreLtmFromTurnRecord(sessionId, roundCount === 0 ? null : getLatestTurnRecord(sessionId));
  restoreTablesFromTurnRecord(sessionId, roundCount === 0 ? null : getLatestTurnRecord(sessionId));

  for (const entry of getDailyEntriesAfterRound(sessionId, roundCount)) {
    deleteDiaryFile(sessionId, entry.date_str);
  }
  deleteDailyEntriesAfterRound(sessionId, roundCount);

  clearPending(sessionId, 4);
  log.info(`QUEUE CLEAR  ${formatMeta({ session: sid, threshold: 4 })}`);

  const { worldId, characterIds } = mode.resolveScope(sessionId);
  if (!worldId) return { stateRolledBack: false };

  // 优先用残留轮次快照；回滚到零残留（重生成首轮）时无轮次快照，
  // 退回首轮前基线（保住手动预设、丢弃被重生成轮次的污染）；二者皆无（老会话）才保留现状。
  const lastRecord = getLatestTurnRecordWithSnapshot(sessionId);
  const snapshotJson = lastRecord?.state_snapshot ?? getSessionStateBaseline(sessionId);
  restoreStateFromSnapshot(sessionId, worldId, characterIds, snapshotJson ? JSON.parse(snapshotJson) : null);
  log.info(
    `STATE ROLLBACK  ${formatMeta({
      session: sid,
      hasSnapshot: !!lastRecord?.state_snapshot,
      fromBaseline: !lastRecord?.state_snapshot && !!snapshotJson,
    })}`
  );

  return { stateRolledBack: true };
}
