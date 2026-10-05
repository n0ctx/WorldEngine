/**
 * 根据 id hash 生成固定颜色，用于无头像时的占位圆形
 *
 * 颜色从当前主题的主色派生（进了世界、深色主题下即世界主色），只转色相：
 * 以主色色相为中心，在 ±52.5° 内按 15° 取 8 个点，亮度奇偶交替做二次区分，
 * 相邻两档的色相差 15°、亮度也不同，肉眼可辨；彩度压在中低档，白字始终读得清。
 * 色相不绕满一圈，避免暖色主题里冒出紫、绿这类和主题无关的颜色。
 */
const HUE_OFFSETS = [-52.5, -37.5, -22.5, -7.5, 7.5, 22.5, 37.5, 52.5];
const LIGHTNESS = ['0.46', '0.56'];
const PALETTE = HUE_OFFSETS.map(
  (offset, i) => `oklch(from var(--we-color-accent) ${LIGHTNESS[i % 2]} 0.09 calc(h + ${offset}))`,
);

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
