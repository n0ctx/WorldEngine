/**
 * 写卡助手输入框
 *
 * `disabled` 仅用于外部硬性禁用；任务状态本身不封锁输入。
 * running/awaiting_approval/paused/终态都允许用户继续表达意图。
 * 不再提供"停止"按钮——若需取消当前任务，用户在输入框敲 `/stop` 并发送。
 * 当任务正在跑时新消息会在服务端排队，等当前 tool 循环结束后再处理。
 */

import { useEffect, useRef } from 'react';
import { ArrowUp } from 'lucide-react';
import { isImeComposing } from '../../frontend/src/core/utils/ime.js';

export default function InputBox({ value, onChange, onSend, disabled = false, placeholder }) {
  const textareaRef = useRef(null);

  // 自动调整高度；触顶后允许原生纵向滚动条出现，避免长输入被裁切看不到。
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    // 仅当真实内容超过上限才出滚动条；否则隐藏，避免空输入/占位文案折行误触发拖动条。
    el.style.overflowY = el.scrollHeight > 120 ? 'auto' : 'hidden';
  }, [value]);

  function handleKeyDown(e) {
    if (isImeComposing(e)) return;
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  }

  const sendDisabled = disabled || !value.trim();
  const hint = placeholder ?? '描述想写或想改的内容';

  return (
    <div className="we-asst-composer">
      <div className="we-chat-input__row we-material">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          placeholder={disabled ? '当前暂不可输入' : hint}
          aria-label="给写卡助手的消息"
          rows={1}
          className="we-chat-textarea we-asst-composer__textarea"
        />
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          className="we-chat-send-btn"
          title="发送 (Enter)"
          aria-label="发送"
        >
          <ArrowUp size={20} strokeWidth={2} />
        </button>
      </div>
      <p className="we-asst-composer__hint">Enter 发送 · Shift+Enter 换行 · /stop 停止</p>
    </div>
  );
}
