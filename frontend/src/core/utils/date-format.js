/**
 * 叙事风格日期格式化：今日 / 昨日 / X月X日 / YYYY年X月
 * 用于会话列表等需要文学气质的日期展示场景。
 */
export function formatDateLiterary(ts) {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((todayStart - dayStart) / 86400000);
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  if (diffDays === 0) return '今日';
  if (diffDays === 1) return '昨日';
  if (d.getFullYear() === now.getFullYear()) return `${mo}月${day}日`;
  return `${d.getFullYear()}年${mo}月`;
}
