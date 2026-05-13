/**
 * 写卡助手输入框
 *
 * `disabled` 仅用于外部硬性禁用；任务状态本身不封锁输入。
 * running/awaiting_approval/paused/终态都允许用户继续表达意图。
 * 不再提供"停止"按钮——若需取消当前任务，用户在输入框敲 `/stop` 并发送。
 * 当任务正在跑时新消息会在服务端排队，等当前 tool 循环结束后再处理。
 */

import { useEffect, useRef } from 'react';

export default function InputBox({ value, onChange, onSend, disabled = false, placeholder }) {
  const textareaRef = useRef(null);

  // 自动调整高度，但限制在面板内的安全高度范围；超出时不展示原生滚动条。
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) {
        onSend();
      }
    }
  }

  const sendDisabled = disabled || !value.trim();
  const hint = placeholder ?? 'Enter 发送，Shift+Enter 换行，/stop 停止当前任务';

  return (
    <div className="flex flex-shrink-0 items-end gap-2 border-t border-black/10 bg-[var(--we-color-bg-canvas)] px-3 py-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? '当前暂不可输入' : hint}
        rows={1}
        className="min-h-[36px] max-h-[120px] flex-1 resize-none overflow-y-hidden rounded-[var(--we-radius-sm)] border border-[var(--we-color-border-subtle)] bg-[var(--we-color-bg-canvas)] px-3 py-2 text-[13px] leading-relaxed text-[var(--we-color-text-primary)] outline-none transition-colors focus-visible:border-[var(--we-color-accent)] disabled:cursor-not-allowed disabled:bg-[var(--we-color-bg-subtle)]"
        style={{ fontFamily: 'var(--we-font-body)' }}
      />
      <button
        type="button"
        onClick={onSend}
        disabled={sendDisabled}
        className="h-9 min-w-[52px] flex-shrink-0 rounded-[var(--we-radius-sm)] bg-[var(--we-color-accent)] px-3 text-[13px] italic text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--we-color-accent)]/30"
        style={{ fontFamily: 'var(--we-font-display)' }}
      >
        发送
      </button>
    </div>
  );
}
