// 写作章节分组规则与翻页规则：前后端共用，避免边界漂移
// 两者解耦：CHAPTER_TURN_SIZE 决定 prose 模式按多少轮切一章；PAGE_TURN_SIZE 仅用于翻页条切片。
// 当前为默认值；用户可在「设置 → 功能配置」覆盖（chat / writing 各一份）。
export const CHAPTER_TURN_SIZE = 20;
export const PAGE_TURN_SIZE = 50;
export const CHAPTER_MESSAGE_SIZE = CHAPTER_TURN_SIZE * 2;

/**
 * 把"每章轮数"换算为章节消息条数阈值（含 user + assistant）。
 * chapterTurnSize 非正整数时回落到默认 CHAPTER_TURN_SIZE。
 */
export function resolveChapterMessageSize(chapterTurnSize) {
  const n = Number(chapterTurnSize);
  if (!Number.isFinite(n) || n <= 0) return CHAPTER_MESSAGE_SIZE;
  return Math.floor(n) * 2;
}
