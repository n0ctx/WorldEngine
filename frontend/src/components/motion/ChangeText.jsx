/* 世界状态被改写时的文字特效：playKey 每换一次播一次，外观由当前动效包决定。
 * 默认（数值）：信号锁定是错位撕裂；墨流是新值穿过扰动的水面浮上来。
 * decode（整段文字）：信号锁定是切片成字；墨流是墨从一侧洇开。
 * 真实文字始终在 DOM 里，读屏读到的永远是最终值、版面也不跳。 */
import { useMotion } from '../../core/hooks/useMotion.js';
import InkWarp from './InkWarp.jsx';

export default function ChangeText({ text, playKey = null, decode = false }) {
  const m = useMotion();
  const vars = m.fx();
  if (vars == null || playKey == null) return text;

  const content = decode ? (
    <span key={playKey} className="we-fx-glyph we-fx-glyph--block" data-ch={text} style={vars}>
      <span className="we-fx-glyph__face" data-ch={text}>{text}</span>
    </span>
  ) : (
    <span key={playKey} className="we-fx-burst" data-text={text} style={vars}>
      {text}
    </span>
  );

  if (!m.pack.traits.warp) return content;
  return (
    <InkWarp key={playKey} strength={decode ? 10 : 16} duration={decode ? m.pack.fx.decode : m.pack.fx.burst}>
      {content}
    </InkWarp>
  );
}
