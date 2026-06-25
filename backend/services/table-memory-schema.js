/**
 * table-memory-schema.js — 5 张内置表格记忆的结构定义（列写死）
 * 每行额外含两个内置列：id（代码分配的自增主键）、别名（实体历史称呼）
 */

export const FIELD_MAX_CHARS = 60;

// 行数上限单值的合法范围：0 = 不限制；上限避免误填超大值
export const ROW_LIMIT_MAX = 1000;

export const TABLE_SCHEMAS = {
  relations: { name: '关系表', columns: ['主体A', '主体B', '关系类型', '信任/敌意', '债务/承诺', '冲突点'],
    defaultMaxRows: 40,
    purpose: '记录两个角色/势力之间的关系。主语是「人与人」，不是地点或事件。关系发生变化时直接覆写「信任/敌意」「冲突点」等列，不另记变更流水。' },
  items:     { name: '物品表', columns: ['物品', '持有人/位置', '类型', '效果/用途', '限制条件', '状态'],
    defaultMaxRows: 30,
    purpose: '记录有名有姓的关键物品。主语是「物」。' },
  places:    { name: '地点表', columns: ['地点', '所属势力', '当前状态', '危险/资源', '历史标记'],
    defaultMaxRows: 30,
    purpose: '记录地点本身的客观属性，主语永远是「这个地方」，不是角色。「当前状态」写此地此刻的物理/归属状况（谁控制、完好还是被毁、能否进入），不要复述角色行动；「历史标记」只写发生在此地、并改变了它属性的关键节点，一句话名词化标记即可（如「曾被血祭，祭坛已封」），不要写角色之间的剧情过程——那属于剧情表。' },
  plotlines: { name: '剧情表', columns: ['剧情线', '关联角色/地点', '当前阶段', '状态'],
    defaultMaxRows: 25,
    purpose: '记录「尚未收尾的剧情线索/悬念」，仅作连贯性备忘，不是必须推进的任务清单。每行是一条还没了结的线（未解之谜、未达成的目标、埋下的伏笔）。「当前阶段」用一句话写它现在停在哪一步，可顺带点明玩家是否介入、台下进展如何（如「玩家未介入，仇家已在城外集结」）。「状态」只填两种之一：**进行中**（还在发展）或 **搁置**（玩家暂时不碰、但这条线还没有任何结局）。**最关键的一条铁律：「搁置」≠「完成」。只要一条线有了任何结局——真相揭晓、目标达成或失败、或被彻底放弃作废——它就算「了结」，必须立刻用 close 操作归档（reason 写明结局），绝对不能把它留在表里、把状态写成「搁置」「完成」「已结束」「已达成」。留在表里的永远只能是「还没有结局」的线。**这是给 AI 的参考便签：玩家转向新方向时，未了结的旧线可标「搁置」自然淡出，不要为了「清线」把剧情往回拉；玩家明显且永久放弃的线，直接 close（reason 写「玩家放弃」）。已经一次性发生完、无后续悬念的事件不要记这里——那是历史，归记忆召回。' },
  factions:  { name: '势力表', columns: ['势力', '类型/性质', '控制范围', '核心人物', '当前实力', '立场'],
    defaultMaxRows: 20,
    purpose: '记录任何「有组织的群体」——不限题材：门派、家族、朝廷、商会、帮派、军队，也包括现代的公司、机构、团伙、产业链团队、线上群组/社群（如某个 QQ 群、论坛圈子）等。判断标准只有一条：它是「一群人组成的集体」而非单个人。主语永远是「这个组织」。每行钉在一个具体组织上：记它的范围/地盘、核心人物、当前实力。「立场」一列汇总它对玩家及对其他势力的态度（盟友/敌对/中立，如「敌视玩家，与青云宗结盟」），势力之间的立场写在这里、不重复进关系表。**只要正文里出现这样一个群体，就在本表为它单独立一行，哪怕它的某个成员已经写在了关系表里——成员关系归关系表，组织本身归这里，两者并存不算重复。**只写「这个组织当前是什么样」的静态快照，不写事件经过（事件走剧情表）。' },
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
