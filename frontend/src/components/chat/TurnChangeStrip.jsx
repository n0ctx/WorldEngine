import { useMotion } from '../../core/hooks/useMotion.js';
import useSidePanelsStore from '../../core/state/sidePanels.js';
import Button from '../ui/Button.jsx';

// 一条回复下最多列出的变化，其余收进「另有 N 项」
const MAX_SHOWN = 6;

/**
 * 本轮变化条：挂在产生变化的那条回复下方，每个变了的字段一枚——字段名 + 本轮变化标签
 * （与状态面板里同一枚，出现方式由动效包决定）。点一枚就展开右侧状态面板并定位到那个字段。
 * changes 来自 useTurnChanges；没有变化时不渲染。
 */
export default function TurnChangeStrip({ changes }) {
  const fxVars = useMotion().fx();
  const revealStateField = useSidePanelsStore((s) => s.revealStateField);
  if (!changes?.length) return null;
  const shown = changes.slice(0, MAX_SHOWN);
  const rest = changes.length - shown.length;

  return (
    <div className="we-turn-changes" role="group" aria-label="本轮状态变化">
      {shown.map((change) => (
        <Button
          key={change.id}
          variant="secondary"
          size="sm"
          aria-label={`${change.label} ${change.text}，在状态面板中查看`}
          onClick={() => revealStateField(change.target)}
        >
          {change.label}
          <span
            className={`we-change-tag we-change-tag--${change.tone}${fxVars ? ' we-change-tag--play' : ''}`}
            style={fxVars ?? undefined}
            aria-hidden="true"
          >
            {change.text}
          </span>
        </Button>
      ))}
      {rest > 0 && (
        <Button variant="text" size="sm" onClick={() => revealStateField({})}>
          另有 {rest} 项
        </Button>
      )}
    </div>
  );
}
