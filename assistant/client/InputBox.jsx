/**
 * 写卡助手输入框
 */

import { useRef, useEffect } from 'react';

export default function InputBox({ value, onChange, onSend, onStop, isStreaming }) {
  const disabled = isStreaming;
  const textareaRef = useRef(null);

  // 自动调整高度
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [value]);

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!disabled && value.trim()) onSend();
    }
  }

  return (
    <div
      style={{
        borderTop: '1px solid rgba(0,0,0,0.08)',
        padding: '10px 12px',
        display: 'flex',
        gap: '8px',
        alignItems: 'flex-end',
        background: 'var(--we-paper-base, #f4ede4)',
      }}
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder="和写卡助手说话... (Enter 发送，Shift+Enter 换行)"
        rows={1}
        style={{
          flex: 1,
          resize: 'none',
          border: '1px solid rgba(0,0,0,0.12)',
          borderRadius: '6px',
          padding: '7px 10px',
          fontSize: '13px',
          fontFamily: 'var(--we-font-body)',
          background: disabled ? 'rgba(0,0,0,0.04)' : '#fff',
          color: 'var(--we-ink-primary, #3d2e22)',
          lineHeight: '1.5',
          outline: 'none',
          transition: 'border-color 0.15s',
          minHeight: '36px',
          maxHeight: '120px',
          overflowY: 'auto',
        }}
        onFocus={(e) => { e.target.style.borderColor = 'rgba(138,94,74,0.4)'; }}
        onBlur={(e) => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; }}
      />
      <button
        onClick={isStreaming ? onStop : onSend}
        disabled={!isStreaming && !value.trim()}
        style={{
          padding: '7px 14px',
          background: isStreaming
            ? 'rgba(192,57,43,0.85)'
            : !value.trim() ? 'rgba(138,94,74,0.3)' : 'var(--we-vermilion, #8a5e4a)',
          color: '#fff',
          border: 'none',
          borderRadius: '6px',
          fontSize: '13px',
          fontFamily: 'var(--we-font-display)',
          fontStyle: isStreaming ? 'normal' : 'italic',
          cursor: !isStreaming && !value.trim() ? 'default' : 'pointer',
          transition: 'background 0.15s',
          flexShrink: 0,
          height: '36px',
          minWidth: '52px',
        }}
      >
        {isStreaming ? '■ 停止' : '发送'}
      </button>
    </div>
  );
}
