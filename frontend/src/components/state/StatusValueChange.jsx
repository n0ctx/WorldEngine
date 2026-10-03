import ChangeText from '../motion/ChangeText.jsx';
import { useChangeBurst } from '../motion/useChangeBurst.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import { changeTag } from '../../core/utils/state-value-format.js';

/**
 * 状态字段值：本轮真的变了就来一次信号故障——数字错位重播，文字从乱码解码成新值，
 * 值后面刷出一枚本轮变化标签并一直留到下一轮。
 * 只在本轮 diff 也认定"变了"时出现：切换会话等换数据的场景值会变，但 diff 已清空。
 * `value` 是参与比较的原始展示值，`text` 是最终渲染的文字（数字带上限 / 单位，文字已套模板变量）。
 */
export default function StatusValueChange({ value, text, changed, isNumber }) {
  const burst = useChangeBurst(value);
  const fxVars = useMotion().fx();
  const playKey = changed && burst ? burst.key : null;
  const tag = playKey != null && value != null && burst.from != null
    ? changeTag(burst.from, value, isNumber)
    : null;

  return (
    <>
      <ChangeText text={text} playKey={playKey} decode={!isNumber} />
      {tag ? (
        <span
          key={playKey}
          className={`we-change-tag we-change-tag--${tag.tone}${fxVars ? ' we-change-tag--play' : ''}`}
          style={fxVars ?? undefined}
          aria-hidden="true"
        >
          {tag.text}
        </span>
      ) : null}
    </>
  );
}
