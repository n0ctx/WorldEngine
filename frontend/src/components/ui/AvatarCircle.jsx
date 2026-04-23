import { getAvatarUrl, getAvatarColor } from '../../utils/avatar';

/**
 * AvatarCircle — 通用头像圆圈组件
 * Props:
 *   id         — 用于生成颜色的唯一标识（character.id / persona.id 等）
 *   name       — 用于生成首字母（为空时显示 '?'）
 *   avatarPath — 头像文件路径（可选）
 *   size       — 'sm'(32px) | 'md'(48px) | 'lg'(64px)，默认 'md'
 *
 * 尺寸档位通过 CSS variant 类（we-avatar-circle--sm/md/lg）实现；
 * 动态颜色通过 CSS custom property 注入，视觉属性仍由 CSS 控制。
 */
export default function AvatarCircle({ id, name, avatarPath, size = 'md' }) {
  const url = getAvatarUrl(avatarPath);
  const color = getAvatarColor(id);
  const initial = (name || '?')[0].toUpperCase();
  const sizeClass = `we-avatar-circle--${size}`;

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className={`we-avatar-circle we-avatar-circle--img ${sizeClass}`}
      />
    );
  }

  return (
    <div
      className={`we-avatar-circle we-avatar-circle--placeholder ${sizeClass}`}
      style={{ '--avatar-bg': color }}
    >
      {initial}
    </div>
  );
}
