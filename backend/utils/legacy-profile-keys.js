/**
 * legacy-profile-keys.js — 旧版档案初始值的字段改名
 *
 * 外貌组曾有「体型」(build，一句话) 与「显著特征」(distinguishing_features，列表)，
 * 现拆为「身材特征」(body_features) 与「外貌特征」(appearance_features)，两者都是列表。
 * 数据库升级与导入旧卡片共用这一条转换规则。
 */

/** 把 {字段key: 值} 里的旧 key 换成新 key；体型的一句话成为身材特征的第一条。返回新对象。 */
export function upgradeLegacyProfileDefaults(defaults) {
  const { build, distinguishing_features: features, ...rest } = defaults;
  if (features !== undefined && rest.appearance_features === undefined) rest.appearance_features = features;
  if (typeof build === 'string' && build.trim() && rest.body_features === undefined) rest.body_features = [build];
  return rest;
}
