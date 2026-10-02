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

// 检字：一颗方铅字每拍弹起、换一个字、落下压实（样式见 themes/motion/letterpress.css）；小尺寸放不下字，只留铅块
const TYPE_GLYPHS = ['世', '界', '书', '章'];
const TYPE_GLYPH_MIN_SIZE = 24;

function TypeOrb({ size = 24, className = '' }) {
  return (
    <span aria-hidden="true" className={`we-type-orb${className ? ` ${className}` : ''}`} style={{ width: size, height: size }}>
      <span className="we-type-orb__slug">
        {size >= TYPE_GLYPH_MIN_SIZE && (
          <span className="we-type-orb__reel">
            {TYPE_GLYPHS.map((glyph) => <span key={glyph}>{glyph}</span>)}
          </span>
        )}
      </span>
    </span>
  );
}

const ORBS = { matrix: MatrixOrb, ink: InkOrb, type: TypeOrb };

export default function MotionOrb(props) {
  const Orb = ORBS[useMotion().pack.traits.orb];
  return <Orb {...props} />;
}
