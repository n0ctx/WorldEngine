/** 本实体类型启用的档案字段定义 */
export function visibleProfileDefs(schema, entity) {
  const activeKeys = new Set(entity.activeProfileFields ?? []);
  return (schema?.profileFields?.[entity.type] ?? []).filter((def) => activeKeys.has(def.key));
}

export function changedProfileKeys(entity, diffKeys) {
  const prefix = `${entity.entity_id}:profile.`;
  return new Set([...(diffKeys ?? [])].filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length)));
}
