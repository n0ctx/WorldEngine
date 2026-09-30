// 档案字段分组共用工具，三个组件共用同一份分组顺序。
// groupRowsByProfile：按 row.group 分组并过滤空组（CardEditTabs、CardProfileDefaultsDetail）。
// rankProfileGroup：分组排序权重，未知分组排最后（StateMemoryProfileGroups）。
const PROFILE_GROUP_ORDER = ['身份', '外貌', '人格'];

export function groupRowsByProfile(rows) {
  return PROFILE_GROUP_ORDER
    .map((group) => ({ group, fields: rows.filter((row) => row.group === group) }))
    .filter(({ fields }) => fields.length > 0);
}

export function rankProfileGroup(group) {
  const index = PROFILE_GROUP_ORDER.indexOf(group);
  return index === -1 ? PROFILE_GROUP_ORDER.length : index;
}
