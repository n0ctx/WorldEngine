/**
 * 根据角色 id hash 生成固定颜色，用于无头像时的占位圆形
 */
// 暖色调色板 — 与羊皮纸/墨水设计系统协调
const PALETTE = [
  '#a23b2e', // 朱砂红
  '#7c2a20', // 深朱砂
  '#a0833f', // 金箔黄
  '#8b5a1f', // 琥珀棕
  '#5c6b3a', // 苔绿
  '#3a6155', // 松绿
  '#4a5568', // 石板青
  '#3a4a6b', // 藏青
  '#6b4f6b', // 灰紫
  '#7a4030', // 铁锈红
  '#7a5030', // 铜褐
  '#5a6550', // 鼠尾绿
  '#7a455a', // 胭脂
  '#3a5a5a', // 鸭青
  '#6b5040', // 土褐
  '#534236', // 墨褐
];

export function getAvatarColor(id) {
  if (!id) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}

/**
 * 根据 avatar_path 构建完整 URL，供 <img src> 使用
 */
export function getAvatarUrl(avatarPath) {
  if (!avatarPath) return null;
  return `/api/uploads/${avatarPath}`;
}
