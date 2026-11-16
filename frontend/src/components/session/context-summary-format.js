/** 剧情摘要弹窗的文案：轮次区间、层级名、统计说明 */

export const TIER_LABEL = { 1: '摘要', 2: '提炼', 3: '浓缩' };

export function roundRange(from, to) {
  return from === to ? `第 ${from} 轮` : `第 ${from}–${to} 轮`;
}

/** 连续没整理成功达到这个次数就提示「暂缓重试」（后端按次数指数拉长重试间隔） */
const BACKOFF_HINT_MIN_STREAK = 2;

const OUTCOME_HINT = { failed: '上次整理失败', stale: '上次整理期间剧情有变动，结果没有写入' };

export function statsHint(stats) {
  if (!stats || stats.latestRound === 0) return '还没有剧情';
  const parts = [`共 ${stats.latestRound} 轮`];
  if (stats.coveredRounds > 0) {
    const ratio = stats.compressionRatio ? `，约为原文的 1/${Math.round(stats.compressionRatio)}` : '';
    parts.push(`${stats.coveredRounds} 轮已整理成 ${stats.activeBlocks} 段摘要${ratio}`);
  }
  parts.push(`${stats.rawRounds} 轮保留原文`);
  if (stats.usage != null) parts.push(`上一轮上下文占用 ${Math.round(stats.usage * 100)}%`);
  const outcome = OUTCOME_HINT[stats.lastOutcome];
  const streak = stats.noWriteStreak ?? 0;
  const backoff = streak >= BACKOFF_HINT_MIN_STREAK ? `已连续 ${streak} 次没整理成功，暂缓重试。` : '';
  return `${parts.join('，')}。${outcome ? `${outcome}${stats.lastError ? `：${stats.lastError}` : ''}。` : ''}${backoff}`;
}
