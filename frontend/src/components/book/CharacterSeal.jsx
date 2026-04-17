import { getAvatarColor, getAvatarUrl } from '../../utils/avatar.js';

export default function CharacterSeal({ character, size = 72 }) {
  if (!character) return null;

  const color = getAvatarColor(character.id);
  const avatarUrl = getAvatarUrl(character.avatar_path);
  const chars = (character.name || '').slice(0, 2);
  const char1 = chars[0] || '';
  const char2 = chars[1] || '';

  if (avatarUrl) {
    return (
      <div style={{ width: size, height: size, position: 'relative', display: 'inline-block', flexShrink: 0 }}>
        {/* 双线印章外框 */}
        <svg
          viewBox="0 0 76 76"
          fill="none"
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        >
          <rect x="4" y="4" width="68" height="68" rx="2" stroke={color} strokeWidth="2.5" />
          <rect x="8.5" y="8.5" width="59" height="59" rx="1" stroke={color} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.6" />
        </svg>
        {/* 圆形头像 */}
        <div
          style={{
            position: 'absolute',
            top: '14%',
            left: '14%',
            width: '72%',
            height: '72%',
            borderRadius: '50%',
            overflow: 'hidden',
          }}
        >
          <img src={avatarUrl} alt={character.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        </div>
      </div>
    );
  }

  // 无头像：完整 SVG 印章
  return (
    <svg viewBox="0 0 76 76" fill="none" style={{ width: size, height: size, flexShrink: 0 }}>
      {/* 外框实线 */}
      <rect x="4" y="4" width="68" height="68" rx="2" stroke={color} strokeWidth="2.5" />
      {/* 内框虚线 */}
      <rect x="8.5" y="8.5" width="59" height="59" rx="1" stroke={color} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.6" />
      {char2 ? (
        <>
          <text x="38" y="31" textAnchor="middle" fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif" fontSize="15" fill={color}>{char1}</text>
          <line x1="16" y1="40" x2="60" y2="40" stroke={color} strokeWidth="0.7" opacity="0.45" />
          <text x="38" y="58" textAnchor="middle" fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif" fontSize="15" fill={color}>{char2}</text>
        </>
      ) : (
        <text x="38" y="44" textAnchor="middle" fontFamily="ZCOOL XiaoWei, LXGW WenKai TC, serif" fontSize="18" fill={color}>{char1}</text>
      )}
    </svg>
  );
}
