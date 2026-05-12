/**
 * 写卡助手输入框
 *
 * `disabled` 仅在终态（completed/failed/cancelled）传入；
 * 其余状态（含 executing/awaiting_approval）允许排队消息。
 * `isStreaming` 为 true 时将发送键换成停止键。
 */

import { useEffect, useRef } from 'react';

export default function InputBox({ value, onChange, onSend, onStop, disabled = false, isStreaming = false }) {
  const textareaRef = useRef(null);

  // 自动调整高度：完全跟随内容增长，不出现滚动条
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        onStop?.();
      } else if (!disabled && value.trim()) {
        onSend();
      }
    }
  }

  const sendDisabled = disabled || !value.trim();

  return (
    <div className="flex flex-shrink-0 items-end gap-2 border-t border-black/10 bg-[var(--we-paper-base)] px-3 py-2">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={disabled ? '任务已结束，点击「清空」开始新任务' : 'Enter 发送，Shift+Enter 换行'}
        rows={1}
        className="min-h-[36px] flex-1 resize-none overflow-hidden rounded-[var(--we-radius-sm)] border border-[var(--we-color-border-subtle)] bg-[var(--we-paper-base)] px-3 py-2 text-[13px] leading-relaxed text-[var(--we-ink-primary)] outline-none transition-colors focus-visible:border-[var(--we-vermilion)] disabled:cursor-not-allowed disabled:bg-[var(--we-paper-aged)]"
        style={{ fontFamily: 'var(--we-font-body)' }}
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="停止生成"
          className="h-9 min-w-[52px] flex-shrink-0 rounded-[var(--we-radius-sm)] border border-[var(--we-vermilion)] bg-[var(--we-paper-base)] px-3 text-[13px] italic text-[var(--we-vermilion)] transition-opacity hover:bg-[var(--we-vermilion)]/10"
          style={{ fontFamily: 'var(--we-font-display)' }}
        >
          停止
        </button>
      ) : (
        <button
          type="button"
          onClick={onSend}
          disabled={sendDisabled}
          className="h-9 min-w-[52px] flex-shrink-0 rounded-[var(--we-radius-sm)] bg-[var(--we-vermilion)] px-3 text-[13px] italic text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-[var(--we-vermilion)]/30"
          style={{ fontFamily: 'var(--we-font-display)' }}
        >
          发送
        </button>
      )}
    </div>
  );
}
