import { getAvatarUrl } from '../../core/utils/avatar.js';
import WorldSceneArt from '../ui/WorldSceneArt.jsx';

// 世界画：有封面用封面，没有用按世界名生成的场景画（与书架无封面世界同一张）
export default function WorldArt({ world, className }) {
  const cover = getAvatarUrl(world?.cover_path);
  return cover
    ? <img src={cover} alt="" className={className} />
    : <WorldSceneArt name={world?.name} className={className} />;
}
