import { useState, useRef, useEffect } from 'react';
import { applyRules } from '../../utils/regex-runner.js';

const SLASH_COMMANDS = [
  { cmd: '/continue',    desc: '续写上一条 AI 回复' },
  { cmd: '/impersonate', desc: 'AI 替你写一条消息' },
  { cmd: '/retry',       desc: '删除最后一条 AI 回复并重新生成' },
  { cmd: '/clear',       desc: '清空当前会话所有消息' },
  { cmd: '/summary',     desc: '手动触发生成当前会话摘要' },
];

export default function InputBox({
  onSend,
  onStop,
  generating,
  impersonating,
  lastUserContent,
  worldId,
  onContinue,
  onImpersonate,
  onRetry,
  onClear,
  onSummary,
  fillText,
  onFillTextConsumed,
}) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // 自动调整高度
  function adjustHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  useEffect(() => { adjustHeight(); }, [text]);

  // 外部填入文本（impersonate）
  useEffect(() => {
    if (fillText) {
      setText(fillText);
      onFillTextConsumed?.();
      textareaRef.current?.focus();
    }
  }, [fillText]);

  // 过滤命令列表
  const filteredCommands = text.startsWith('/')
    ? SLASH_COMMANDS.filter((c) => c.cmd.startsWith(text.toLowerCase().trim()))
    : [];

  // 当输入变化时控制浮层
  function handleChange(e) {
    const val = e.target.value;
    setText(val);
    if (val.startsWith('/')) {
      setSlashOpen(true);
      setSlashIndex(0);
    } else {
      setSlashOpen(false);
    }
  }

  function executeCommand(cmd) {
    setText('');
    setSlashOpen(false);
    switch (cmd) {
      case '/continue':    onContinue?.();    break;
      case '/impersonate': onImpersonate?.(); break;
      case '/retry':       onRetry?.();       break;
      case '/clear':       onClear?.();       break;
      case '/summary':     onSummary?.();     break;
    }
  }

  function handleKeyDown(e) {
    // Slash 命令浮层键盘导航
    if (slashOpen && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashIndex((i) => (i + 1) % filteredCommands.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashIndex((i) => (i - 1 + filteredCommands.length) % filteredCommands.length);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        executeCommand(filteredCommands[slashIndex].cmd);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashOpen(false);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // 输入框为空时按 Up 键填入上一条 user 消息
    if (e.key === 'ArrowUp' && !text && lastUserContent) {
      e.preventDefault();
      setText(lastUserContent);
    }
  }

  function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || generating || impersonating) return;
    // user_input scope：发送前应用正则替换
    const processed = applyRules(trimmed, 'user_input', worldId ?? null);
    onSend(processed, attachments);
    setText('');
    setAttachments([]);
    setSlashOpen(false);
  }

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    const MAX_IMAGES = 3;
    const MAX_SIZE = 5 * 1024 * 1024;

    const remaining = MAX_IMAGES - attachments.length;
    const selected = files.slice(0, remaining);
    const rejected = [];

    const readers = selected.map(
      (file) =>
        new Promise((resolve) => {
          if (file.size > MAX_SIZE) {
            rejected.push(file.name);
            resolve(null);
            return;
          }
          const reader = new FileReader();
          reader.onload = (ev) => {
            const base64 = ev.target.result.split(',')[1];
            resolve({ type: 'image', data: base64, mimeType: file.type, preview: ev.target.result });
          };
          reader.readAsDataURL(file);
        }),
    );

    Promise.all(readers).then((results) => {
      const valid = results.filter(Boolean);
      if (rejected.length) {
        alert(`以下图片超过 5MB，已跳过：${rejected.join(', ')}`);
      }
      if (valid.length) {
        setAttachments((prev) => [...prev, ...valid]);
      }
    });
  }

  function removeAttachment(i) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  return (
    <div
      className="we-chat-input"
      style={{
        borderTop: '1px solid var(--we-paper-shadow)',
        background: 'var(--we-paper-base)',
        padding: '12px 16px 14px',
      }}
    >
      {/* 图片缩略图 */}
      {attachments.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
          {attachments.map((att, i) => (
            <div key={i} style={{ position: 'relative' }}>
              <img
                src={att.preview}
                alt=""
                style={{ height: '64px', width: '64px', objectFit: 'cover', borderRadius: '2px', border: '1px solid var(--we-paper-shadow)' }}
              />
              <button
                onClick={() => removeAttachment(i)}
                style={{
                  position: 'absolute', top: '-6px', right: '-6px',
                  width: '16px', height: '16px',
                  background: 'var(--we-ink-secondary)', color: 'var(--we-paper-base)',
                  borderRadius: '50%', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '10px', lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* 附件按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={generating || attachments.length >= 3}
          style={{
            flexShrink: 0, padding: '8px',
            color: 'var(--we-ink-faded)',
            background: 'none', border: 'none', cursor: 'pointer',
            opacity: (generating || attachments.length >= 3) ? 0.3 : 0.6,
            transition: 'opacity 0.15s',
            borderRadius: '2px',
          }}
          title="添加图片（最多3张）"
          onMouseEnter={(e) => { if (!generating && attachments.length < 3) e.currentTarget.style.opacity = '1'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = (generating || attachments.length >= 3) ? '0.3' : '0.6'; }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />

        {/* 输入框 */}
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Slash 命令浮层 */}
          {slashOpen && filteredCommands.length > 0 && (
            <div style={{
              position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, right: 0,
              background: 'var(--we-paper-base)',
              border: '1px solid var(--we-paper-shadow)',
              borderTop: '2px solid var(--we-vermilion)',
              borderRadius: 'var(--we-radius-sm)',
              boxShadow: '0 -4px 16px rgba(42,31,23,0.12), 0 0 0 1px rgba(42,31,23,0.05)',
              overflow: 'hidden',
              zIndex: 20,
            }}>
              {filteredCommands.map((c, i) => (
                <button
                  key={c.cmd}
                  onMouseDown={(e) => { e.preventDefault(); executeCommand(c.cmd); }}
                  style={{
                    width: '100%', textAlign: 'left',
                    padding: '9px 16px',
                    display: 'flex', alignItems: 'baseline', gap: '12px',
                    background: i === slashIndex ? 'var(--we-paper-aged)' : 'transparent',
                    border: 'none', cursor: 'pointer',
                    borderLeft: i === slashIndex ? '2px solid var(--we-vermilion)' : '2px solid transparent',
                    transition: 'background 0.12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--we-paper-aged)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = i === slashIndex ? 'var(--we-paper-aged)' : 'transparent'; }}
                >
                  <span style={{
                    fontFamily: 'var(--we-font-display)',
                    fontSize: '13.5px',
                    fontStyle: 'italic',
                    color: 'var(--we-vermilion)',
                    width: '112px',
                    flexShrink: 0,
                  }}>{c.cmd}</span>
                  <span style={{
                    fontFamily: 'var(--we-font-serif)',
                    fontSize: '12.5px',
                    color: 'var(--we-ink-faded)',
                  }}>{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* Impersonate 等待动画覆盖层：pointerEvents:all 阻断用户交互，同时不 disabled textarea 保证值同步 */}
          {impersonating && (
            <div style={{
              position: 'absolute', inset: 0,
              display: 'flex', alignItems: 'center',
              paddingLeft: '16px',
              background: 'rgba(244,237,228,0.85)',
              pointerEvents: 'all',
              zIndex: 5,
            }}>
              <style>{`
                @keyframes we-imp-dots {
                  0%   { content: ''; }
                  25%  { content: '.'; }
                  50%  { content: '..'; }
                  75%  { content: '...'; }
                  100% { content: ''; }
                }
                .we-imp-dots::after {
                  content: '';
                  animation: we-imp-dots 1.2s steps(1) infinite;
                }
              `}</style>
              <span style={{
                fontFamily: 'var(--we-font-serif)',
                fontStyle: 'italic',
                fontSize: '14px',
                color: 'var(--we-ink-faded)',
                opacity: 0.7,
              }}>
                AI 正在构思<span className="we-imp-dots" />
              </span>
            </div>
          )}

          {/* 快捷图标：锚定在 textarea 右下角，用 onMouseDown 避免 textarea 失焦拦截 */}
          <div style={{
            position: 'absolute', top: '50%', right: '10px', transform: 'translateY(-50%)',
            display: 'flex', gap: '4px', zIndex: 10,
          }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); if (!generating) onContinue?.(); }}
              disabled={generating}
              style={{
                width: '28px', height: '28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--we-paper-base)',
                border: '1px solid var(--we-paper-shadow)',
                borderRadius: '3px',
                color: 'var(--we-ink-faded)',
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.25 : 0.5,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
              title="续写上一条 AI 回复"
              onMouseEnter={(e) => { if (!generating) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'var(--we-ink-secondary)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = generating ? '0.25' : '0.5'; e.currentTarget.style.borderColor = 'var(--we-paper-shadow)'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); if (!generating) onImpersonate?.(); }}
              disabled={generating}
              style={{
                width: '28px', height: '28px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'var(--we-paper-base)',
                border: '1px solid var(--we-paper-shadow)',
                borderRadius: '3px',
                color: 'var(--we-ink-faded)',
                cursor: generating ? 'not-allowed' : 'pointer',
                opacity: generating ? 0.25 : 0.5,
                transition: 'opacity 0.15s, border-color 0.15s',
              }}
              title="AI 替你写一条消息"
              onMouseEnter={(e) => { if (!generating) { e.currentTarget.style.opacity = '1'; e.currentTarget.style.borderColor = 'var(--we-ink-secondary)'; } }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = generating ? '0.25' : '0.5'; e.currentTarget.style.borderColor = 'var(--we-paper-shadow)'; }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            placeholder={impersonating ? '' : '发送消息… (Shift+Enter 换行，/ 调出命令)'}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={generating}
            rows={1}
            style={{
              width: '100%',
              padding: '12px 16px',
              paddingRight: '76px',
              paddingBottom: '14px',
              background: 'rgba(0,0,0,0.025)',
              border: '1px solid var(--we-paper-shadow)',
              borderRadius: 'var(--we-radius-none)',
              fontFamily: 'var(--we-font-serif)',
              fontSize: '15px',
              lineHeight: '1.65',
              color: 'var(--we-ink-primary)',
              resize: 'none',
              outline: 'none',
              minHeight: '48px',
              overflowY: 'hidden',
              opacity: generating ? 0.6 : 1,
              transition: 'border-color 0.18s, box-shadow 0.18s',
            }}
            onFocus={(e) => {
              e.target.style.borderColor = 'var(--we-vermilion)';
              e.target.style.boxShadow = '0 0 0 2px rgba(162,59,46,0.12)';
            }}
            onBlur={(e) => {
              e.target.style.borderColor = 'var(--we-paper-shadow)';
              e.target.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* 发送 / 停止 */}
        {generating ? (
          <button
            onClick={onStop}
            style={{
              flexShrink: 0, padding: '10px',
              background: 'var(--we-vermilion)',
              color: 'var(--we-paper-base)',
              border: 'none', borderRadius: '2px',
              cursor: 'pointer', transition: 'opacity 0.15s',
            }}
            title="停止生成"
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            style={{
              flexShrink: 0, padding: '10px',
              background: text.trim() ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)',
              color: 'var(--we-paper-base)',
              border: 'none', borderRadius: '2px',
              cursor: text.trim() ? 'pointer' : 'not-allowed',
              transition: 'background 0.18s, opacity 0.15s',
              opacity: text.trim() ? 1 : 0.5,
            }}
            title="发送 (Enter)"
            onMouseEnter={(e) => { if (text.trim()) e.currentTarget.style.opacity = '0.85'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = text.trim() ? '1' : '0.5'; }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
