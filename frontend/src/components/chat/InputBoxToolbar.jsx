import { motion } from 'framer-motion';
import { ArrowDownToLine, BookMarked, FastForward, Table2, UserRoundPen } from 'lucide-react';

// 点击工具条按钮时不让输入框失焦；动作本身走 onClick，键盘 Enter/Space 同样可触发
function keepInputFocus(e) {
  e.preventDefault();
}

export default function InputBoxToolbar({
  pagerSlot,
  m,
  press,
  generating,
  onScrollToBottom,
  onContinue,
  onImpersonate,
  onMiddleSummary,
  onTableMemory,
}) {
  return (
    <div className="we-chat-input__toolbar">
      <div className="we-chat-input__toolbar-pager">{pagerSlot}</div>
      <div className="we-chat-quick-actions">
        <motion.button
          type="button"
          onMouseDown={keepInputFocus}
          onClick={() => onScrollToBottom?.()}
          className="we-chat-quick-btn"
          title="跳转到底部"
          aria-label="跳转到底部"
          {...press}
        >
          <ArrowDownToLine size={20} />
        </motion.button>
        <motion.button
          type="button"
          onMouseDown={keepInputFocus}
          onClick={() => onContinue?.()}
          disabled={generating}
          className="we-chat-quick-btn"
          title="续写上一条 AI 回复"
          aria-label="续写上一条 AI 回复"
          {...m.gesture('press', { disabled: generating })}
        >
          <FastForward size={20} fill="currentColor" fillOpacity={0.22} />
        </motion.button>
        <motion.button
          type="button"
          onMouseDown={keepInputFocus}
          onClick={() => onImpersonate?.()}
          disabled={generating}
          className="we-chat-quick-btn"
          title="AI 替你写一条消息"
          aria-label="AI 替你写一条消息"
          {...m.gesture('press', { disabled: generating })}
        >
          <UserRoundPen size={20} />
        </motion.button>
        {onMiddleSummary && (
          <motion.button
            type="button"
            onMouseDown={keepInputFocus}
            onClick={() => onMiddleSummary()}
            className="we-chat-quick-btn"
            title="剧情摘要"
            aria-label="剧情摘要"
            {...press}
          >
            <BookMarked size={20} />
          </motion.button>
        )}
        {onTableMemory && (
          <motion.button
            type="button"
            onMouseDown={keepInputFocus}
            onClick={() => onTableMemory()}
            className="we-chat-quick-btn"
            title="表格记忆"
            aria-label="表格记忆"
            {...press}
          >
            <Table2 size={20} />
          </motion.button>
        )}
      </div>
    </div>
  );
}
