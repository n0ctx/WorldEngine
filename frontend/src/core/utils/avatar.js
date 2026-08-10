/**
 * 根据角色 id hash 生成固定颜色，用于无头像时的占位圆形
 *
 * 色相在 360° 上按 22.5° 均匀取 16 个点（非任意挑选的暖色系样本），
 * 亮度奇偶交替 36%/46% 做二次区分：旧调色板 16 色里有 6 个挤在
 * 8°–42° 的橙棕区间，哈希落在该区间的世界/角色在深色底上几乎同色
 * （书架页无封面卡曾出现 4 张肉眼无法区分的问题）。均匀分布 + 亮度
 * 交替能保证任意两个哈希桶的色相差 ≥22.5°，相邻桶必然可辨。
 */
const PALETTE = [
  'hsl(0, 42%, 36%)',
  'hsl(22.5, 42%, 46%)',
  'hsl(45, 42%, 36%)',
  'hsl(67.5, 42%, 46%)',
  'hsl(90, 42%, 36%)',
  'hsl(112.5, 42%, 46%)',
  'hsl(135, 42%, 36%)',
  'hsl(157.5, 42%, 46%)',
  'hsl(180, 42%, 36%)',
  'hsl(202.5, 42%, 46%)',
  'hsl(225, 42%, 36%)',
  'hsl(247.5, 42%, 46%)',
  'hsl(270, 42%, 36%)',
  'hsl(292.5, 42%, 46%)',
  'hsl(315, 42%, 36%)',
  'hsl(337.5, 42%, 46%)',
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
  if (/^(https?:|data:|blob:)/.test(avatarPath) || avatarPath.startsWith('/')) {
    return avatarPath;
  }
  return `/api/uploads/${avatarPath}`;
}
