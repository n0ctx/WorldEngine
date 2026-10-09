import { worldSceneTint } from '../../core/utils/worldScene.js';

/** 世界卡外层的类名：有没有封面、是不是首位大门 */
export function worldCardClassName({ hasCover, feature = false }) {
  return `we-world-card we-material${hasCover ? ' we-world-card--has-cover' : ' we-world-card--tinted'}${feature ? ' we-world-card--feature' : ''}`;
}

/**
 * 世界自己的颜色：主色，没有封面时取场景画的染色；有封面但还没有主色时不给。
 * 写成行内 --world-tint，只给主题皮肤取用（如骰界战役盒的侧边与标签色条）。
 */
export function worldCardTintStyle({ name, accentColor, hasCover }) {
  const tint = accentColor || (hasCover ? null : worldSceneTint(name));
  return tint ? { '--world-tint': tint } : undefined;
}
