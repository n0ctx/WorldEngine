import { deleteDailyEntriesAfterRound, getDailyEntriesAfterRound } from '../../../db/queries/daily-entries.js';
import {
  deleteTurnRecordsAfterRound,
  getLatestTurnRecordWithSnapshot,
} from '../../../db/queries/turn-records.js';
import { withSessionStateTransaction } from '../../../db/queries/session-state-batch.js';
import { getSessionStateBaseline } from '../../../db/queries/sessions.js';
import { rollbackStateMemory } from '../../../db/queries/state-memory.js';
import { clearPending, waitForQueueIdle } from '../../../utils/async-queue.js';
import { ALL_MESSAGES_LIMIT } from '../../../utils/constants.js';
import { formatMeta } from '../../../utils/logger.js';
import { restoreStateFromSnapshot } from '../../../memory/state-rollback.js';
import { deleteDiaryFile } from '../../../memory/diary-generator.js';

/**
 * 回滚一个会话：等队列空闲后截断消息，再按剩余轮次截断轮次记录，
 * 还原状态记忆（多版本表 + 实体字段值）/ 日记 / 状态快照。重生成、编辑消息、删除消息只在截断方式上不同。
 *
 * 截断消息与各项回滚在同一事务里，任何一步出错都整体撤销，消息与状态不会停在半途；
 * 附件这类外部资源在事务前由 cleanup 清理，日记文件在事务提交后再删。
 *
 * 模式差异只剩「世界与角色怎么解析」，由 mode.resolveScope 吃掉。
 *
 * @param {{ cleanup?: () => Promise<void>, truncate?: () => void }} truncation - cleanup 清理将被删除消息的
 *   外部资源；truncate 只删改数据库行，必须同步。不截断消息时传空对象。
 * @param {{ redoLatestRound?: boolean }} [opts] - redoLatestRound 为 true 时，末尾即使是 AI 回复
 *   也把最后一轮算作待重做（续写、编辑最后一条 AI 回复要重做该轮）。
 */
export async function rollbackSession(mode, sessionId, { cleanup, truncate }, { redoLatestRound = false } = {}) {
  const log = mode.log;
  const sid = sessionId.slice(0, 8);

  await waitForQueueIdle(sessionId);
  await cleanup?.();

  const { stateRolledBack, diaryDates } = withSessionStateTransaction(() => {
    truncate?.();

    // 只保留已完成的轮次：末尾是用户消息（重生成 / 编辑）时该轮待重做，末尾是 AI 回复（删除消息后）时各轮都完整；
    // redoLatestRound 时末尾即使是 AI 回复也算最后一轮待重做
    const remaining = mode.session.getMessages(sessionId, ALL_MESSAGES_LIMIT, 0);
    const roundCount = remaining.filter((message) => message.role === 'user').length;
    const keptRounds = !redoLatestRound && remaining.at(-1)?.role === 'assistant'
      ? roundCount
      : Math.max(0, roundCount - 1);

    deleteTurnRecordsAfterRound(sessionId, keptRounds);
    log.info(`TURN-RECORD TRUNCATE  ${formatMeta({ session: sid, keepUntilRound: keptRounds })}`);

    rollbackStateMemory(sessionId, keptRounds);

    const dates = getDailyEntriesAfterRound(sessionId, keptRounds + 1).map((entry) => entry.date_str);
    deleteDailyEntriesAfterRound(sessionId, keptRounds + 1);

    const { worldId, characterIds } = mode.resolveScope(sessionId);
    if (!worldId) return { stateRolledBack: false, diaryDates: dates };

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
    return { stateRolledBack: true, diaryDates: dates };
  });

  clearPending(sessionId, 4);
  log.info(`QUEUE CLEAR  ${formatMeta({ session: sid, threshold: 4 })}`);

  for (const date of diaryDates) {
    deleteDiaryFile(sessionId, date);
  }

  return { stateRolledBack };
}
