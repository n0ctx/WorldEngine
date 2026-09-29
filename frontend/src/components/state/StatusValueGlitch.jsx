import GlitchText from '../motion/GlitchText.jsx';
import { useChangeBurst } from '../motion/useChangeBurst.js';
import { useMotion } from '../../core/hooks/useMotion.js';

// 本轮变化标签：数字给出方向与幅度（▲350 / ▼4），其余类型只标「更新」
function changeTag(from, to, isNumber) {
  if (!isNumber) return { text: '更新', tone: 'neutral' };
  const delta = Math.round((Number(to) - Number(from)) * 1e6) / 1e6;
  if (!Number.isFinite(delta) || delta === 0) return { text: '更新', tone: 'neutral' };
  return { text: `${delta > 0 ? '▲' : '▼'}${Math.abs(delta)}`, tone: delta > 0 ? 'up' : 'down' };
}

/**
 * 状态字段值：本轮真的变了就来一次信号故障——数字错位重播，文字从乱码解码成新值，
 * 值后面刷出一枚本轮变化标签并一直留到下一轮。
 * 只在本轮 diff 也认定"变了"时出现：切换会话等换数据的场景值会变，但 diff 已清空。
 * `value` 是参与比较的原始展示值，`text` 是最终渲染的文字（数字带上限 / 单位，文字已套模板变量）。
 */
export default function StatusValueGlitch({ value, text, changed, isNumber }) {
  const burst = useChangeBurst(value);
  const glitchVars = useMotion().glitch();
  const playKey = changed && burst ? burst.key : null;
  const tag = playKey != null && value != null && burst.from != null
    ? changeTag(burst.from, value, isNumber)
    : null;

  return (
    <>
      <GlitchText text={text} playKey={playKey} decode={!isNumber} />
      {tag ? (
        <span
          key={playKey}
          className={`we-glitch-tag we-glitch-tag--${tag.tone}${glitchVars ? ' we-glitch-tag--play' : ''}`}
          style={glitchVars ?? undefined}
          aria-hidden="true"
        >
          {tag.text}
        </span>
      ) : null}
    </>
  );
}
