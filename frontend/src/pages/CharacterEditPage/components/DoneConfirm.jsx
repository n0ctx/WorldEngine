import { useState, useEffect } from 'react';
import ChangeText from '../../../components/motion/ChangeText.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
// 完成确认：右下角一块切角大字，错位砸入、乱码解码，停住后关屏熄灭。
// trigger 是数字，每次 +1 触发一次
export default function DoneConfirm({ trigger, label }) {
  const [showing, setShowing] = useState(false);
  const m = useMotion();
  const fxVars = m.fx();
  const showMs = m.pack.fx.stamp * 1000;

  useEffect(() => {
    if (!trigger) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- trigger starts a bounded confirmation timer.
    setShowing(true);
    const t = setTimeout(() => setShowing(false), showMs);
    return () => clearTimeout(t);
  }, [trigger, showMs]);

  return (
    showing && (
      <div
        className={`we-done-confirm${fxVars ? ' we-done-confirm--play' : ''}`}
        style={fxVars ?? undefined}
        role="status"
      >
        <ChangeText text={label} playKey={fxVars ? trigger : null} decode />
      </div>
    )
  );
}
