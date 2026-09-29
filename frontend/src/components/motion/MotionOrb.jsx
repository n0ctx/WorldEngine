/* 思考 / 等待中的小球：外观由当前动效包决定。 */
import MatrixOrb from './MatrixOrb.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

const ORBS = { signal: MatrixOrb };

export default function MotionOrb(props) {
  const Orb = ORBS[useMotion().pack.id];
  return <Orb {...props} />;
}
