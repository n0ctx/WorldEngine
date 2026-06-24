/**
 * table-memory-schema.js — 6 张内置表格记忆的结构定义（列写死）
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
    purpose: '记录「尚未收尾的剧情线索/悬念」，仅作连贯性备忘，不是必须推进的任务清单。每行是一条还没了结的线（未解之谜、未达成的目标、埋下的伏笔）。各列写它现在停在哪一步、玩家是否介入。**这是给 AI 的参考便签：玩家转向新方向时，旧线可以自然搁置或淡出，不要为了「清线」把剧情往回拉；玩家明显放弃的线，标注搁置或直接 close。**线一旦了结（真相揭晓 / 目标达成或失败）就立刻 close 归档，不要把已完成的线继续留在表里。已经一次性发生完、无后续悬念的事件不要记这里——那是历史，归记忆召回。' },
  factions:  { name: '势力表', columns: ['势力', '类型/性质', '控制范围', '核心人物', '当前实力/动向', '与玩家关系', '盟友/敌对'],
    defaultMaxRows: 20,
    purpose: '记录任何「有组织的群体」——不限题材：门派、家族、朝廷、商会、帮派、军队，也包括现代的公司、机构、团伙、产业链团队、线上群组/社群（如某个 QQ 群、论坛圈子）等。判断标准只有一条：它是「一群人组成的集体」而非单个人。主语永远是「这个组织」。每行钉在一个具体组织上：记它的范围/地盘、核心人物、实力消长与动向、对玩家及对其他势力的立场。**只要正文里出现这样一个群体，就在本表为它单独立一行，哪怕它的某个成员已经写在了关系表里——成员关系归关系表，组织本身归这里，两者并存不算重复。**只写「这个组织当前是什么样」的静态快照，不写事件经过（事件走剧情线表）。' },
  resources: { name: '资源表', columns: ['资源', '当前量', '变化', '来源/说明'],
    defaultMaxRows: 20,
    purpose: '记录「可计量、会增减的身外资源/存量」。判断只看三条，全满足才记：①能用数字或数量衡量（多少钱、几件、百分比、第几级都算）；②会随剧情累积或消耗；③是持有的存量而非一次性事件。**不挑题材**，任何世界观的此类资源都进：货币类（现金/存款/金币/灵石/信用点）、社会资本类（粉丝数/声望/名望/悬赏金额）、物资储备类（弹药/食物/药品/燃料库存）等。「当前量」用自由文本、连单位一起写（如「5.2万」「80两灵石」「73%」）。**不要记入：角色的内在属性（修为/血量/魔力/好感度——那是状态字段的活）；以及组织、据点、灵脉这类实体（走势力表/地点表/物品表）——本表只存纯数字资源。**' },
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

// 渲染所有表的完整结构（key + 中文名 + 列清单 + 记录视角），供副 LLM prompt 无条件注入，
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
