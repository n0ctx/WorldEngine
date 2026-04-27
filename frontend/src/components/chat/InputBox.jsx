import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import { applyRules } from '../../utils/regex-runner.js';
import Icon from '../ui/Icon.jsx';
import { pushErrorToast } from '../../utils/toast';

const SLASH_COMMANDS = [
  { cmd: '/continue',    desc: '续写上一条 AI 回复' },
  { cmd: '/impersonate', desc: 'AI 替你写一条消息' },
  { cmd: '/retry',       desc: '删除最后一条 AI 回复并重新生成' },
  { cmd: '/clear',       desc: '清空当前会话所有消息' },
  { cmd: '/summary',     desc: '手动触发生成当前会话摘要' },
  { cmd: '/title',       desc: '根据最近对话上下文重新生成会话标题' },
];

const InputBox = forwardRef(function InputBox({
  onSend,
  onStop,
  generating,
  impersonating,
  lastUserContent,
  worldId,
  mode = 'chat',
  onScrollToBottom,
  onContinue,
  onImpersonate,
  onRetry,
  onClear,
  onSummary,
  onTitle,
}, ref) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashIndex, setSlashIndex] = useState(0);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);

  // 暴露命令式 fillText 给父组件
  useImperativeHandle(ref, () => ({
    fillText(value) {
      setText(value);
      setTimeout(() => textareaRef.current?.focus(), 0);
    },
  }));

  // 自动调整高度（运行时动态值，保留）
  function adjustHeight() {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }

  useEffect(() => { adjustHeight(); }, [text]);

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
    adjustHeight();
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
      case '/title':       onTitle?.();       break;
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
    if (!trimmed || generating) return;
    // user_input scope：发送前应用正则替换
    const processed = applyRules(trimmed, 'user_input', worldId ?? null, mode);
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
        pushErrorToast(`以下图片超过 5MB，已跳过：${rejected.join(', ')}`);
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
    <div className="we-chat-input">
      {/* 图片缩略图 */}
      {attachments.length > 0 && (
        <div className="we-chat-input__attachments">
          {attachments.map((att, i) => (
            <div key={i} className="we-chat-input__attachment-item">
              <img
                src={att.preview}
                alt=""
                className="we-chat-input__attachment-img"
              />
              <button
                onClick={() => removeAttachment(i)}
                aria-label={`移除第 ${i + 1} 张图片`}
                className="we-chat-input__attachment-remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="we-chat-input__row">
        {/* 附件按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={generating || attachments.length >= 3}
          className="we-chat-input__attach-btn"
          title="添加图片（最多3张）"
          aria-label="添加图片附件（最多3张）"
        >
          <Icon size={16} strokeWidth="1.8">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </Icon>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={handleFileChange}
        />

        {/* 输入框 */}
        <div className="we-chat-input__text-wrap">
          {/* Slash 命令浮层 */}
          {slashOpen && filteredCommands.length > 0 && (
            <div className="we-chat-slash-dropdown">
              {filteredCommands.map((c, i) => (
                <button
                  key={c.cmd}
                  onMouseDown={(e) => { e.preventDefault(); executeCommand(c.cmd); }}
                  className={`we-chat-slash-item${i === slashIndex ? ' we-chat-slash-item--active' : ''}`}
                >
                  <span className="we-chat-slash-item__cmd">{c.cmd}</span>
                  <span className="we-chat-slash-item__desc">{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* impersonate 构思中占位层（无用户输入时覆盖 placeholder） */}
          {impersonating && !text && (
            <div className="we-chat-impersonate-thinking">
              <span className="we-impersonate-thinking we-chat-impersonate-text">AI 正在构思</span>
            </div>
          )}

          {/* 快捷图标：锚定在 textarea 右下角，用 onMouseDown 避免 textarea 失焦拦截 */}
          <div className="we-chat-quick-actions">
            <button
              onMouseDown={(e) => { e.preventDefault(); onScrollToBottom?.(); }}
              className="we-chat-quick-btn"
              title="跳转到底部"
              aria-label="跳转到底部"
            >
              <Icon size={16} strokeWidth="2.2">
                <line x1="4" y1="20" x2="20" y2="20" />
                <polyline points="8 12 12 16 16 12" />
                <line x1="12" y1="4" x2="12" y2="16" />
              </Icon>
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); if (!generating) onContinue?.(); }}
              disabled={generating}
              className="we-chat-quick-btn"
              title="续写上一条 AI 回复"
              aria-label="续写上一条 AI 回复"
            >
              <Icon size={16} strokeWidth="2.2">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </Icon>
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); if (!generating) onImpersonate?.(); }}
              disabled={generating}
              className="we-chat-quick-btn"
              title="AI 替你写一条消息"
              aria-label="AI 替你写一条消息"
            >
              <Icon size={16} strokeWidth="2.2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </Icon>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            placeholder={impersonating && !text ? '' : '发送消息… (Shift+Enter 换行，/ 调出命令)'}
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={generating}
            rows={1}
            className="we-chat-textarea"
          />
        </div>

        {/* 发送 / 停止 */}
        {generating ? (
          <button
            onClick={onStop}
            className="we-chat-send-btn"
            title="停止生成"
            aria-label="停止生成"
          >
            <Icon size={16} fill="currentColor" stroke="none">
              <rect x="6" y="6" width="12" height="12" rx="1" />
            </Icon>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="we-chat-send-btn"
            title="发送 (Enter)"
            aria-label="发送消息"
          >
            <Icon size={16} strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </Icon>
          </button>
        )}
      </div>
    </div>
  );
});

export default InputBox;
