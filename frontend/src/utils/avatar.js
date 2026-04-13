/**
 * 根据角色 id hash 生成固定颜色，用于无头像时的占位圆形
 */
const PALETTE = [
  '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#ef4444', '#f97316',
  '#f59e0b', '#84cc16', '#22c55e', '#10b981',
  '#14b8a6', '#06b6d4', '#3b82f6', '#0ea5e9',
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
  return `/uploads/${avatarPath}`;
}
