/* 信号故障文字：playKey 每换一次播一次。
 * 默认：左右两路错位色切片撕裂、字重抽搐、一道扫描带扫过，然后定格。
 * decode：切片成字——整段文字切成横带，强调色下各自抖动，一层层定住、闪一下后退回正文色。
 * 真实文字始终在 DOM 里，读屏读到的永远是最终值、版面也不跳。 */
import { useMotion } from '../../core/hooks/useMotion.js';

export default function ChangeText({ text, playKey = null, decode = false }) {
  const vars = useMotion().fx();
  if (vars == null || playKey == null) return text;

  if (decode) {
    return (
      <span key={playKey} className="we-fx-glyph we-fx-glyph--block" data-ch={text} style={vars}>
        <span className="we-fx-glyph__face" data-ch={text}>{text}</span>
      </span>
    );
  }

  return (
    <span key={playKey} className="we-fx-burst" data-text={text} style={vars}>
      {text}
    </span>
  );
}
