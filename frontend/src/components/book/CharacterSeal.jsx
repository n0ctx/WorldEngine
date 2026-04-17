import { getAvatarColor, getAvatarUrl } from '../../utils/avatar.js';

export default function CharacterSeal({ character, size = 80 }) {
  if (!character) {
    // 空状态：只渲染空框
    return (
      <svg viewBox="0 0 76 76" fill="none" style={{ width: size, height: size, flexShrink: 0, opacity: 0.25 }}>
        <rect x="4" y="4" width="68" height="68" rx="2" stroke="var(--we-ink-faded)" strokeWidth="2" />
        <rect x="8.5" y="8.5" width="59" height="59" rx="1" stroke="var(--we-ink-faded)" strokeWidth="0.7" strokeDasharray="3 2" opacity="0.5" />
      </svg>
    );
  }

  const color = getAvatarColor(character.id);
  const avatarUrl = getAvatarUrl(character.avatar_path);
  const name = character.name || '';
  const char1 = name[0] || '';
  const char2 = name[1] || '';

  if (avatarUrl) {
    return (
      <div style={{ width: size, height: size, position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        {/* 双线印章框 */}
        <svg
          viewBox="0 0 76 76"
          fill="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <rect x="3" y="3" width="70" height="70" rx="2" stroke={color} strokeWidth="2.5" />
          <rect x="7.5" y="7.5" width="61" height="61" rx="1" stroke={color} strokeWidth="0.8" strokeDasharray="4 2.5" opacity="0.55" />
        </svg>
        {/* 圆形头像内嵌 */}
        <div
          style={{
            position: 'absolute',
            top: '15%',
            left: '15%',
            width: '70%',
            height: '70%',
            borderRadius: '50%',
            overflow: 'hidden',
            boxShadow: `0 0 0 1px ${color}33`,
          }}
        >
          <img src={avatarUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    );
  }

  // 无头像：文字印章 SVG
  // 单字居中；双字上下分排；超过2字取前两字
  const showTwo = char2 !== '';

  return (
    <svg viewBox="0 0 76 76" fill="none" style={{ width: size, height: size, flexShrink: 0 }}>
      {/* 外框实线 */}
      <rect x="3" y="3" width="70" height="70" rx="2" stroke={color} strokeWidth="2.5" />
      {/* 内框虚线 */}
      <rect x="7.5" y="7.5" width="61" height="61" rx="1" stroke={color} strokeWidth="0.8" strokeDasharray="4 2.5" opacity="0.55" />

      {showTwo ? (
        <>
          {/* 双字竖排 */}
          <text
            x="38" y="31"
            textAnchor="middle"
            fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif"
            fontSize="16"
            fill={color}
          >
            {char1}
          </text>
          {/* 中间细横线 */}
          <line x1="18" y1="39.5" x2="58" y2="39.5" stroke={color} strokeWidth="0.6" opacity="0.4" />
          <text
            x="38" y="59"
            textAnchor="middle"
            fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif"
            fontSize="16"
            fill={color}
          >
            {char2}
          </text>
        </>
      ) : (
        /* 单字居中（垂直精确居中于 76 高） */
        <text
          x="38" y="45"
          textAnchor="middle"
          fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif"
          fontSize="22"
          fill={color}
        >
          {char1}
        </text>
      )}
    </svg>
  );
}
