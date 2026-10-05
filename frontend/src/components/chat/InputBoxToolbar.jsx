import { IconFastForward, IconUserPen } from '../ui/icons.jsx';
import IconButton from '../ui/IconButton.jsx';

// 点击工具条按钮时不让输入框失焦；动作本身走 onClick，键盘 Enter/Space 同样可触发
function keepInputFocus(e) {
  e.preventDefault();
}

export default function InputBoxToolbar({
  pagerSlot,
  generating,
  onContinue,
  onImpersonate,
}) {
  return (
    <div className="we-chat-input__toolbar">
      <div className="we-chat-input__toolbar-pager">{pagerSlot}</div>
      <div className="we-chat-quick-actions">
        <IconButton
          size="sm"
          label="续写上一条 AI 回复"
          onMouseDown={keepInputFocus}
          onClick={() => onContinue?.()}
          disabled={generating}
        >
          <IconFastForward size={16} />
        </IconButton>
        <IconButton
          size="sm"
          label="AI 替你写一条消息"
          onMouseDown={keepInputFocus}
          onClick={() => onImpersonate?.()}
          disabled={generating}
        >
          <IconUserPen size={16} />
        </IconButton>
      </div>
    </div>
  );
}
