import { getAvatarUrl } from '../../core/utils/avatar.js';

// 角色头像徽记：圆形头像 + 角色色描边；无头像时用名字首字
export default function CharacterSeal({ character, size = 80, color = 'var(--we-color-accent)' }) {
  const sealVars = { '--seal-size': `${size}px`, '--seal-color': color };

  if (!character) {
    return <span className="we-character-seal we-character-seal--empty" style={sealVars} aria-hidden="true" />;
  }

  const avatarUrl = getAvatarUrl(character.avatar_path);
  const name = character.name || '';

  if (avatarUrl) {
    return (
      <span className="we-character-seal" style={sealVars}>
        <img src={avatarUrl} alt={name} className="we-character-seal-avatar" />
      </span>
    );
  }

  return (
    <span className="we-character-seal we-character-seal--initial" style={sealVars} role="img" aria-label={name}>
      {name[0] || ''}
    </span>
  );
}
