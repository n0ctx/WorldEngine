/**
 * table-memory-schema.js — 5 张内置表格记忆的结构定义（列写死）
 * 每行额外含两个内置列：id（代码分配的自增主键）、别名（实体历史称呼）
 */

export const FIELD_MAX_CHARS = 60;

// 行数上限单值的合法范围：0 = 不限制；上限避免误填超大值
export const ROW_LIMIT_MAX = 1000;

export const TABLE_SCHEMAS = {
  relations: { name: '关系表', columns: ['主体A', '主体B', '关系类型', '信任/敌意', '债务/承诺'],
    defaultMaxRows: 40,
    purpose: '记录两个角色/势力之间「当前是什么关系」的静态快照。主语是「人与人」，不是地点或事件。关系发生变化时直接覆写「信任/敌意」「债务/承诺」等列，不另记变更流水。**只记当前状态，不记「两人在为什么吵、谁该报复谁」这类待激化的冲突议程**——具体恩怨经过归历史召回，本表不是给主笔催冲突的剧情钩子。' },
  items:     { name: '物品表', columns: ['物品', '持有人/位置', '类型', '效果/用途', '限制条件', '状态'],
    defaultMaxRows: 30,
    purpose: '记录有名有姓的关键物品。主语是「物」。' },
  places:    { name: '地点表', columns: ['地点', '所属势力', '当前状态', '危险/资源', '历史标记'],
    defaultMaxRows: 30,
    purpose: '记录地点本身的客观属性，主语永远是「这个地方」，不是角色。「当前状态」写此地此刻的物理/归属状况（谁控制、完好还是被毁、能否进入），不要复述角色行动；「历史标记」只写发生在此地、并改变了它属性的关键节点，一句话名词化标记即可（如「曾被血祭，祭坛已封」），不要写角色之间的剧情过程——那属于剧情叙事，归历史召回。' },
  plotlines: { name: '信息表', columns: ['信息', '知情者', '误解者', '真实性', '影响'],
    defaultMaxRows: 25,
    purpose: '记录「重要的信息差」——谁知道真相、谁被蒙在鼓里或信了假版本，是给主笔防穿帮的「红线清单」，不是剧情日记。**门槛极严、宁缺勿滥（只留极少数行）：只记会左右剧情、一旦主笔记错就穿帮的关键信息差（如隐藏身份、未公开的死讯/真凶、伪造的情报、秘密协议）；人尽皆知、无信息差、或无关紧要的信息一律不记。** 「信息」写那条关键信息（查重主键，一句话名词化）；「知情者」写谁知道真相；「误解者」写谁信了错的版本（没有就空——默认未列入知情者的即不知情，不必穷举不知情者）；「真实性」填 真/假/半真；「影响」用一句短句写这道信息差被谁拿来做什么、在推动什么（如「宰相借此架空王权」），不展开解释、不超一行。**与历史召回分工：召回记事件细节，本表只记信息差红线；同一件事两边都有不算重复。** 有人新得知真相 → 用 update 改「知情者/误解者」；只有剧情回滚或改设定让某条不再成立（retcon）时才 close（reason「设定撤销」），正常推进不必 close。' },
  factions:  { name: '势力表', columns: ['势力', '类型/性质', '控制范围', '核心人物', '当前实力', '立场'],
    defaultMaxRows: 20,
    purpose: '记录任何「有组织的群体」——不限题材：门派、家族、朝廷、商会、帮派、军队，也包括现代的公司、机构、团伙、产业链团队、线上群组/社群（如某个 QQ 群、论坛圈子）等。判断标准只有一条：它是「一群人组成的集体」而非单个人。主语永远是「这个组织」。每行钉在一个具体组织上：记它的范围/地盘、核心人物、当前实力。「立场」一列汇总它对玩家及对其他势力的态度（盟友/敌对/中立，如「敌视玩家，与青云宗结盟」），势力之间的立场写在这里、不重复进关系表。**只要正文里出现这样一个群体，就在本表为它单独立一行，哪怕它的某个成员已经写在了关系表里——成员关系归关系表，组织本身归这里，两者并存不算重复。**只写「这个组织当前是什么样」的静态快照，不写事件经过（事件叙事归历史召回）。' },
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
