/**
 * table-memory-schema.js — 5 张内置表格记忆的结构定义（列写死）
 * 每行额外含两个内置列：id（代码分配的自增主键）、别名（实体历史称呼）
 */

export const FIELD_MAX_CHARS = 60;

export const TABLE_SCHEMAS = {
  relations: { name: '关系表', columns: ['主体A', '主体B', '关系类型', '信任/敌意', '债务/承诺', '冲突点', '最近变化'] },
  items:     { name: '物品表', columns: ['物品', '持有人/位置', '类型', '效果/用途', '限制条件', '状态'] },
  places:    { name: '地点表', columns: ['地点', '所属势力', '当前状态', '危险/资源', '已发生事件', '可触发内容'] },
  plotlines: { name: '剧情线表', columns: ['剧情线', '关联角色/地点', '当前阶段', '紧急度', '玩家是否介入', '后台处理结果', '状态'] },
  world:     { name: '世界状态表', columns: ['规则/事实', '影响范围', '当前状态', '来源事件', '是否可逆'] },
};

export const TABLE_KEYS = Object.keys(TABLE_SCHEMAS);

// 渲染五张表的完整结构（key + 中文名 + 列清单），供副 LLM prompt 无条件注入，
// 避免空表时模型看不到列名、靠猜导致字段被静默丢弃。
export function renderSchemaGuide() {
  return TABLE_KEYS
    .map((key) => `- ${key}（${TABLE_SCHEMAS[key].name}）：${TABLE_SCHEMAS[key].columns.join(' | ')}`)
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
