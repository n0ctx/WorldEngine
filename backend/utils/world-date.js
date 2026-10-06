/**
 * world-date.js — 世界日期解析与年龄推算
 *
 * 世界日期格式为 `YYYY-MM-DD` 或 `YYYY-MM-DDTHH:mm`，年份位数不限，用于状态记忆的
 * 世界档案「当前时间」、未了事项的期限判断、档案字段「出生日期」「记录年龄」的年龄推算，
 * 以及 AI 提取角色卡建议时按世界开场日期由年龄倒推出生日期。
 */

const WORLD_DATE_PATTERN = /^(\d+)-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/;

/**
 * 解析世界日期字符串，失败返回 null。
 * @returns {{year:number, month:number, day:number, hour:number, minute:number} | null}
 */
export function parseWorldDate(str) {
  if (typeof str !== 'string') return null;
  const match = WORLD_DATE_PATTERN.exec(str.trim());
  if (!match) return null;
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);
  const hour = hourStr != null ? Number(hourStr) : 0;
  const minute = minuteStr != null ? Number(minuteStr) : 0;
  if (year <= 0 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  return { year, month, day, hour, minute };
}

/** 系统当前时间（上海时区），格式同世界日期 `YYYY-MM-DDTHH:mm` */
export function formatSystemWorldTime() {
  const local = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  return `${pad(local.getFullYear(), 4)}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`;
}

/** 世界当前日期：故事时间没设置或无法解析时按系统时间 */
export function currentWorldDate(worldTime) {
  return parseWorldDate(worldTime) ?? parseWorldDate(formatSystemWorldTime());
}

/**
 * 规范出生日期：合法世界日期去掉首尾空白返回；半角或全角问号统一为「?」，
 * 表示早于世界纪年、年龄无从推算；其余返回 null。
 */
export function normalizeBirthDate(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '?' || trimmed === '？') return '?';
  return parseWorldDate(trimmed) ? trimmed : null;
}

/** 世界日期对象格式化为只到日期的 `YYYY-MM-DD` */
export function formatWorldDateOnly(worldDate) {
  const mm = String(worldDate.month).padStart(2, '0');
  const dd = String(worldDate.day).padStart(2, '0');
  return `${worldDate.year}-${mm}-${dd}`;
}

/**
 * 由某天的年龄倒推出生日期 `YYYY-MM-DD`：月日取那一天，即那天刚满这个年龄。
 * 年龄不是非负整数、或倒推出的年份不是正数时返回 null。
 */
export function birthDateFromAge(age, asOf) {
  if (!Number.isInteger(age) || age < 0 || asOf.year - age <= 0) return null;
  return formatWorldDateOnly({ ...asOf, year: asOf.year - age });
}

/** 比较两个世界日期，a 早于 b 返回负数，晚于返回正数，相等返回 0 */
export function compareWorldDate(a, b) {
  for (const field of ['year', 'month', 'day', 'hour', 'minute']) {
    const diff = a[field] - b[field];
    if (diff !== 0) return diff;
  }
  return 0;
}

/** 故事时间 now 是否已过期限 deadline（世界日期字符串）。期限只写到日期时，过了当天才算过期。 */
export function isPastWorldDeadline(deadline, now) {
  const parsed = parseWorldDate(deadline);
  if (!parsed || !now) return false;
  if (!deadline.includes('T')) return compareWorldDate({ ...now, hour: 0, minute: 0 }, parsed) > 0;
  return compareWorldDate(now, parsed) > 0;
}

/** 计算 from 到 to 相隔的整年数，按月日比较（生日未到时少算一年） */
export function yearsBetween(from, to) {
  let years = to.year - from.year;
  if (to.month < from.month || (to.month === from.month && to.day < from.day)) {
    years -= 1;
  }
  return years;
}

/**
 * 按 §3.5 规则推算档案的年龄：
 * - 有 birth_date 且有世界日期：年龄 = 两者相隔的整年数；
 * - 否则有 age_recorded.as_of_date 且有世界日期：age + 相隔的整年数；
 * - 否则有 age_recorded：显示「约 {age} 岁（记于第 {as_of_round} 轮）」，不推算确切年龄；
 * - 都不满足：返回 null。
 * @param {{birth_date?: string, age_recorded?: {age:number, as_of_date?:string, as_of_round:number}}} profile
 * @param {{year:number, month:number, day:number, hour:number, minute:number} | null} worldDate
 * @returns {{age: number|null, text: string} | null}
 */
export function deriveAge({ birth_date, age_recorded } = {}, worldDate) {
  const birth = birth_date ? parseWorldDate(birth_date) : null;
  if (birth && worldDate) {
    const age = yearsBetween(birth, worldDate);
    return { age, text: `${age} 岁` };
  }

  const asOfDate = age_recorded?.as_of_date ? parseWorldDate(age_recorded.as_of_date) : null;
  if (asOfDate && worldDate && typeof age_recorded.age === 'number') {
    const age = age_recorded.age + yearsBetween(asOfDate, worldDate);
    return { age, text: `${age} 岁` };
  }

  if (age_recorded && typeof age_recorded.age === 'number') {
    return { age: null, text: `约 ${age_recorded.age} 岁（记于第 ${age_recorded.as_of_round} 轮）` };
  }

  return null;
}
