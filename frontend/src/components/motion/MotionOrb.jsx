/* 思考 / 等待中的小球：外观由当前动效包决定。 */
import FluidOrb from './FluidOrb.jsx';
import MatrixOrb from './MatrixOrb.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

// 小尺寸放不下流体纹理：一颗缓慢胀缩的墨珠（样式见 themes/motion/liquid.css）
const FLUID_MIN_SIZE = 32;

function InkOrb({ size = 24, className = '' }) {
  if (size >= FLUID_MIN_SIZE) return <FluidOrb size={size} className={className} />;
  return (
    <span
      aria-hidden="true"
      className={`we-ink-bead${className ? ` ${className}` : ''}`}
      style={{ '--we-ink-bead-size': `${Math.round(size * 0.5)}px`, width: size, height: size }}
    />
  );
}

const ORBS = { matrix: MatrixOrb, ink: InkOrb };

export default function MotionOrb(props) {
  const Orb = ORBS[useMotion().pack.traits.orb];
  return <Orb {...props} />;
}
