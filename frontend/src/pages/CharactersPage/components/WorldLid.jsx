import WorldSceneArt from '../../../components/ui/WorldSceneArt.jsx';
import { getAvatarUrl } from '../../../core/utils/avatar';

/** 世界页页头：封面按世界卡的完整比例缩成一张小图，旁边是世界名与简介。 */
export function WorldLid({ world }) {
  if (!world) return null;
  return (
    <header className="we-world-lid">
      <span className="we-world-lid-art">
        {world.cover_path
          ? <img src={getAvatarUrl(world.cover_path)} alt="" />
          : <WorldSceneArt name={world.name} variant="banner" />}
      </span>
      <div className="we-world-lid-label">
        <h1 className="we-world-lid-name">{world.name}</h1>
        {world.description ? <p className="we-world-lid-desc">{world.description}</p> : null}
      </div>
    </header>
  );
}
