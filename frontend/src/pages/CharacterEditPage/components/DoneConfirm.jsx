import { useState, useEffect } from 'react';
import GlitchText from '../../../components/motion/GlitchText.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { GLITCH } from '../../../core/utils/motion.js';

const SHOW_MS = GLITCH.stamp * 1000;

// 完成确认：右下角一块切角大字，错位砸入、乱码解码，停住后关屏熄灭。
// trigger 是数字，每次 +1 触发一次
export default function DoneSignal({ trigger, label }) {
  const [showing, setShowing] = useState(false);
  const glitchVars = useMotion().glitch();

  useEffect(() => {
    if (!trigger) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger starts a bounded confirmation timer.
    setShowing(true);
    const t = setTimeout(() => setShowing(false), SHOW_MS);
    return () => clearTimeout(t);
  }, [trigger]);

  return (
    showing && (
      <div
        className={`we-done-signal${glitchVars ? ' we-done-signal--play' : ''}`}
        style={glitchVars ?? undefined}
        role="status"
      >
        <GlitchText text={label} playKey={glitchVars ? trigger : null} decode />
      </div>
    )
  );
}
