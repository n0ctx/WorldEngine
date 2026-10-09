import AvatarCircle from '../ui/AvatarCircle.jsx';
import WorldSceneArt from '../ui/WorldSceneArt.jsx';
import SlugText from '../motion/SlugText.jsx';
import { relativeTime } from '../../core/utils/time';

function CastRow({ world }) {
  const hiddenCast = world.character_count - world.cast.length;
  return (
    <div className="we-world-card-meta">
      {world.character_count > 0 ? (
        <span className="we-world-card-cast" role="img" aria-label={`${world.character_count} 个角色`}>
          {world.cast.map((character) => (
            <AvatarCircle
              key={character.id}
              id={character.id}
              name={character.name}
              avatarPath={character.avatar_path}
              size="sm"
            />
          ))}
          {hiddenCast > 0 ? <span className="we-world-card-cast-more">+{hiddenCast}</span> : null}
        </span>
      ) : (
        <span className="we-world-card-cast-empty">还没有角色</span>
      )}
      <span className="we-world-card-time">{relativeTime(world.updated_at)}</span>
    </div>
  );
}

/**
 * 世界卡的画面：封面（没有封面时是按名字生成的场景画）、暗罩、名字、简介和角色行。
 * 书架的世界卡和世界编辑的预览共用这一份；外层的 .we-world-card 与交互由调用方给。
 * children 插在暗罩与正文之间（书架的触摸反馈、指针光）；没有 cast 时不画角色行（预览）。
 */
export default function WorldCardFace({ world, coverSrc, children }) {
  return (
    <>
      {coverSrc ? (
        <img src={coverSrc} alt="" className="we-world-card-bg" />
      ) : (
        <WorldSceneArt name={world.name} className="we-world-card-bg we-world-card-scene" />
      )}
      <div className="we-world-card-overlay" />
      {children}
      <div className="we-world-card-foot">
        <h3 className="we-world-card-name"><SlugText text={world.name} /></h3>
        {world.description ? <p className="we-world-card-desc">{world.description}</p> : null}
        {world.cast ? <CastRow world={world} /> : null}
      </div>
    </>
  );
}
