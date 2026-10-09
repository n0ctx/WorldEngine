import WorldCardFace from '../../components/world/WorldCardFace.jsx';
import { worldCardClassName, worldCardTintStyle } from '../../components/world/worldCard.js';

/**
 * 世界编辑弹层左栏：这个世界在书架上的样子，名字、简介、封面、主色改了立刻跟着变。
 * 和书架共用 WorldCardFace；只看不点，不能拖动，也不画角色行。
 */
export default function WorldCardPreview({ name, description, coverUrl, accentColor }) {
  const world = { name: name || '未命名世界', description };
  const hasCover = !!coverUrl;
  return (
    <figure className="we-edit-world-preview">
      <div className="we-world-card-shell" aria-hidden="true">
        <div className={worldCardClassName({ hasCover })} style={worldCardTintStyle({ name: world.name, accentColor, hasCover })}>
          <WorldCardFace world={world} coverSrc={coverUrl} />
        </div>
      </div>
      <figcaption className="we-edit-aside-note">书架上会是这个样子</figcaption>
    </figure>
  );
}
