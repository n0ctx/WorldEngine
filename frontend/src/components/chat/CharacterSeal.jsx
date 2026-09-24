import { getAvatarUrl } from '../../core/utils/avatar.js';

// 角色头像：只在有真实头像时出现；没有头像时不占位，身份由旁边的名字承担
export default function CharacterSeal({ character, size = 80 }) {
  const avatarUrl = getAvatarUrl(character?.avatar_path);
  if (!avatarUrl) return null;

  return (
    <img
      src={avatarUrl}
      alt=""
      className="we-character-seal"
      style={{ '--seal-size': `${size}px` }}
    />
  );
}
