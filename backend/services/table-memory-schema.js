/**
 * table-memory-schema.js — 5 张内置表格记忆的结构定义（列写死）
 * 每行额外含两个内置列：id（代码分配的自增主键）、别名（实体历史称呼）
 */

export const FIELD_MAX_CHARS = 60;

// 行数上限单值的合法范围：0 = 不限制；上限避免误填超大值
export const ROW_LIMIT_MAX = 1000;

export const TABLE_SCHEMAS = {
  relations: { name: '关系表', columns: ['主体A', '主体B', '关系类型', '信任/敌意', '债务/承诺', '冲突点', '最近变化'],
    defaultMaxRows: 40,
    purpose: '记录两个角色/势力之间的关系。主语是「人与人」，不是地点或事件。' },
  items:     { name: '物品表', columns: ['物品', '持有人/位置', '类型', '效果/用途', '限制条件', '状态'],
    defaultMaxRows: 30,
    purpose: '记录有名有姓的关键物品。主语是「物」。' },
  places:    { name: '地点表', columns: ['地点', '所属势力', '当前状态', '危险/资源', '已发生事件', '可触发内容'],
    defaultMaxRows: 30,
    purpose: '记录地点本身的客观属性，主语永远是「这个地方」，不是角色。「当前状态」写此地此刻的物理/归属状况（谁控制、完好还是被毁、能否进入），不要复述角色行动；「已发生事件」只写发生在此地、并改变了它属性的关键节点，一句话名词化标记即可（如「曾被血祭，祭坛已封」），不要写角色之间的剧情过程——那属于剧情线表。' },
  plotlines: { name: '剧情线表', columns: ['剧情线', '关联角色/地点', '当前阶段', '紧急度', '玩家是否介入', '后台处理结果', '状态'],
    defaultMaxRows: 25,
    purpose: '记录正在推进的事件/阴谋/任务。主语是「一条正在发展的线」。角色之间的行动、阴谋进展、谁对谁做了什么，都归这里，不要塞进地点表。' },
  factions:  { name: '势力表', columns: ['势力', '类型/性质', '控制范围', '核心人物', '当前实力/动向', '与玩家关系', '盟友/敌对'],
    defaultMaxRows: 20,
    purpose: '记录有名有姓的势力/组织（门派、家族、朝廷、商会、帮派、军队等），主语永远是「一个组织」，不是单个角色，也不是事件。每行钉在一个具体势力上：记它的地盘、核心人物、实力消长与动向、对玩家及对其他势力的立场。只写「这个组织当前是什么样」的静态快照，不要写事件经过——某个角色之间的私人恩怨走关系表，正在推进的阴谋/任务走剧情线表。' },
};

export const TABLE_KEYS = Object.keys(TABLE_SCHEMAS);

// 每张表的默认行数上限（key → 数字；0 = 不限制）
export const DEFAULT_ROW_LIMITS = Object.fromEntries(
  TABLE_KEYS.map((key) => [key, TABLE_SCHEMAS[key].defaultMaxRows]),
);

/** 把单个上限值清洗成 [0, ROW_LIMIT_MAX] 的整数；非法值回退到 fallback。 */
export function clampRowLimit(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(ROW_LIMIT_MAX, Math.max(0, Math.trunc(n)));
}

/**
 * 把外部传入的 overrides 合并成完整的 5 表上限 map：
 * 缺失的 key 用默认值补齐，非法值清洗，未知 key 丢弃。
 */
export function resolveRowLimits(overrides) {
  const src = overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
  const out = {};
  for (const key of TABLE_KEYS) {
    out[key] = Object.hasOwn(src, key)
      ? clampRowLimit(src[key], DEFAULT_ROW_LIMITS[key])
      : DEFAULT_ROW_LIMITS[key];
  }
  return out;
}

// 渲染五张表的完整结构（key + 中文名 + 列清单 + 记录视角），供副 LLM prompt 无条件注入，
// 避免空表时模型看不到列名、靠猜导致字段被静默丢弃，也避免把内容写错表（如把剧情塞进地点表）。
export function renderSchemaGuide() {
  return TABLE_KEYS
    .map((key) => {
      const s = TABLE_SCHEMAS[key];
      const head = `- ${key}（${s.name}）：${s.columns.join(' | ')}`;
      return s.purpose ? `${head}\n  · 用途：${s.purpose}` : head;
    })
    .join('\n');
}

export function emptyTables() {
  const tables = {};
  const archive = {};
  for (const key of TABLE_KEYS) {
    tables[key] = { rows: [], nextId: 1 };
    archive[key] = [];
  }
  return { version: 1, tables, archive };
}
