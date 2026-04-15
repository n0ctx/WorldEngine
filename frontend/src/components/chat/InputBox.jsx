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
    ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
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
    if (!trimmed || generating) return;
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
    <div className="we-chat-input border-t border-border bg-canvas px-4 pt-3 pb-4">
      {/* 图片缩略图 */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2">
          {attachments.map((att, i) => (
            <div key={i} className="relative">
              <img
                src={att.preview}
                alt=""
                className="h-16 w-16 object-cover rounded-lg border border-border"
              />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-text text-canvas rounded-full flex items-center justify-center text-[10px] hover:opacity-80"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="relative flex items-end gap-2">
        {/* 附件按钮 */}
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={generating || attachments.length >= 3}
          className="flex-none p-2 rounded-lg text-text-secondary hover:bg-sand disabled:opacity-30 transition-colors"
          title="添加图片（最多3张）"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
          className="hidden"
          onChange={handleFileChange}
        />

        {/* 输入框 */}
        <div className="flex-1 relative">
          {/* Slash 命令浮层 */}
          {slashOpen && filteredCommands.length > 0 && (
            <div className="absolute bottom-full mb-1 left-0 right-0 bg-ivory border border-border rounded-xl shadow-lg overflow-hidden z-20">
              {filteredCommands.map((c, i) => (
                <button
                  key={c.cmd}
                  onMouseDown={(e) => { e.preventDefault(); executeCommand(c.cmd); }}
                  className={`w-full text-left px-4 py-2.5 flex items-baseline gap-3 transition-colors ${
                    i === slashIndex
                      ? 'bg-accent text-white'
                      : 'text-text hover:bg-sand'
                  }`}
                >
                  <span className="text-sm font-mono font-semibold w-28 shrink-0">{c.cmd}</span>
                  <span className="text-xs opacity-70">{c.desc}</span>
                </button>
              ))}
            </div>
          )}

          {/* 快捷图标 */}
          <div className="absolute right-2 top-2 flex gap-1 z-10">
            <button
              onClick={onContinue}
              disabled={generating}
              className="p-1 rounded opacity-40 hover:opacity-80 transition-opacity disabled:cursor-not-allowed"
              title="续写"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
            <button
              onClick={onImpersonate}
              disabled={generating}
              className="p-1 rounded opacity-40 hover:opacity-80 transition-opacity disabled:cursor-not-allowed"
              title="代入"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="w-full px-4 py-3 pr-20 rounded-xl border border-border bg-ivory text-text text-sm leading-relaxed resize-none outline-none focus:border-accent transition-colors placeholder:text-text-secondary placeholder:opacity-40 disabled:opacity-50"
            placeholder="发送消息… (Shift+Enter 换行，/ 调出命令)"
            value={text}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            disabled={generating}
            rows={1}
            style={{ minHeight: '48px' }}
          />
        </div>

        {/* 发送 / 停止 */}
        {generating ? (
          <button
            onClick={onStop}
            className="flex-none p-2.5 rounded-xl bg-error text-white hover:opacity-90 transition-opacity"
            title="停止生成"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="6" width="12" height="12" rx="2" />
            </svg>
          </button>
        ) : (
          <button
            onClick={handleSend}
            disabled={!text.trim()}
            className="flex-none p-2.5 rounded-xl bg-accent text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
            title="发送 (Enter)"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
