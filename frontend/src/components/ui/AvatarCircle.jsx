import { getAvatarUrl, getAvatarColor } from '../../utils/avatar';

/**
 * AvatarCircle — 通用头像圆圈组件
 * Props:
 *   id         — 用于生成颜色的唯一标识（character.id / persona.id 等）
 *   name       — 用于生成首字母（为空时显示 '?'）
 *   avatarPath — 头像文件路径（可选）
 *   size       — 'sm'(32px) | 'md'(48px) | 'lg'(64px)，默认 'md'
 *
 * 注：width/height/backgroundColor 为运行时动态值，保留内联 style；
 *     fontSize 依 size prop 变化，也保留内联 style；
 *     其余视觉属性走 CSS 类。
 */
const SIZE_MAP = { sm: 32, md: 48, lg: 64 };
const FONT_MAP = { sm: 14, md: 16, lg: 24 };

export default function AvatarCircle({ id, name, avatarPath, size = 'md' }) {
  const url = getAvatarUrl(avatarPath);
  const color = getAvatarColor(id);
  const initial = (name || '?')[0].toUpperCase();
  const px = SIZE_MAP[size] ?? SIZE_MAP.md;
  const fs = FONT_MAP[size] ?? FONT_MAP.md;

  if (url) {
    return (
      <img
        src={url}
        alt={name}
        className="we-avatar-circle we-avatar-circle--img"
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className="we-avatar-circle we-avatar-circle--placeholder"
      style={{ width: px, height: px, backgroundColor: color, fontSize: fs }}
    >
      {initial}
    </div>
  );
}
