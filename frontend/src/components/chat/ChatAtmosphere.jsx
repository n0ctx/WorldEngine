import { buildWorldScene } from '../../core/utils/worldScene.js';
import WorldArt from './WorldArt.jsx';

/**
 * 正文纸面上的世界氛围：封面（没有封面用场景画）低浓度铺在纸面上沿并向下渐隐，
 * 左上、右下各压一团世界色光晕，让书架 → 世界页 → 正文连成一条线。
 * 光晕色取世界主色，没有主色时取场景画的染色（与书架环境光同一取法）；浓度跟随主题的环境光强度。
 */
export default function ChatAtmosphere({ world }) {
  if (!world) return null;
  const tint = world.accent_color || buildWorldScene(world.name).tint;
  return (
    <div className="we-chat-atmosphere" style={{ '--atmosphere-tint': tint }} aria-hidden="true">
      <WorldArt world={world} className="we-chat-atmosphere__art" />
    </div>
  );
}
