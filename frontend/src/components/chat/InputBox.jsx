import { useState, useRef, useEffect } from 'react';

export default function InputBox({ onSend, onStop, generating, lastUserContent }) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]);
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

  function handleKeyDown(e) {
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
    onSend(trimmed, attachments);
    setText('');
    setAttachments([]);
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
    <div className="border-t border-[var(--border)] bg-[var(--bg)] px-4 pt-3 pb-4">
      {/* 图片缩略图 */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2">
          {attachments.map((att, i) => (
            <div key={i} className="relative">
              <img
                src={att.preview}
                alt=""
                className="h-16 w-16 object-cover rounded-lg border border-[var(--border)]"
              />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-[var(--text)] text-[var(--bg)] rounded-full flex items-center justify-center text-[10px] hover:opacity-80"
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
          className="flex-none p-2 rounded-lg text-[var(--text)] hover:bg-[var(--border)] disabled:opacity-30 transition-colors"
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
          {/* T25 预留快捷图标 */}
          <div className="absolute right-2 top-2 flex gap-1 z-10">
            <button
              className="p-1 rounded opacity-30 hover:opacity-60 transition-opacity cursor-not-allowed"
              title="续写（T25 实现）"
              disabled
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
            <button
              className="p-1 rounded opacity-30 hover:opacity-60 transition-opacity cursor-not-allowed"
              title="代入（T25 实现）"
              disabled
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </button>
          </div>

          <textarea
            ref={textareaRef}
            className="w-full px-4 py-3 pr-20 rounded-xl border border-[var(--border)] bg-[var(--code-bg)] text-[var(--text-h)] text-sm leading-relaxed resize-none outline-none focus:border-[var(--accent)] transition-colors placeholder:text-[var(--text)] placeholder:opacity-40 disabled:opacity-50"
            placeholder="发送消息… (Shift+Enter 换行)"
            value={text}
            onChange={(e) => setText(e.target.value)}
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
            className="flex-none p-2.5 rounded-xl bg-orange-500 text-white hover:bg-orange-600 transition-colors"
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
            className="flex-none p-2.5 rounded-xl bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity"
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
