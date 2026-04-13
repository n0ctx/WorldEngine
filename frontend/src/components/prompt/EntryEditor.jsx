import { useState, useRef } from 'react';

/**
 * EntryEditor — 创建/编辑 Prompt 条目的模态弹窗
 * Props:
 *   entry      — 现有条目对象（编辑模式）或 null（创建模式）
 *   onSave(data) — 父组件负责实际调用 API，返回 Promise
 *   onClose()  — 关闭弹窗
 */
export default function EntryEditor({ entry, onSave, onClose }) {
  const [title, setTitle] = useState(entry?.title ?? '');
  const [summary, setSummary] = useState(entry?.summary ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [keywords, setKeywords] = useState(
    Array.isArray(entry?.keywords) ? entry.keywords : (entry?.keywords ?? [])
  );
  const [kwInput, setKwInput] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const kwRef = useRef(null);

  function addKeyword(raw) {
    const kw = raw.trim();
    if (!kw) return;
    if (!keywords.includes(kw)) {
      setKeywords((prev) => [...prev, kw]);
    }
    setKwInput('');
  }

  function removeKeyword(kw) {
    setKeywords((prev) => prev.filter((k) => k !== kw));
  }

  function handleKwKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      addKeyword(kwInput);
    } else if (e.key === 'Backspace' && kwInput === '' && keywords.length > 0) {
      setKeywords((prev) => prev.slice(0, -1));
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      setError('标题为必填项');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({
        title: title.trim(),
        summary,
        content,
        keywords: keywords.length > 0 ? keywords : null,
      });
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-[var(--bg)] border border-[var(--border)] rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* 标题栏 */}
        <div className="px-6 py-5 border-b border-[var(--border)] flex-shrink-0">
          <h2 className="text-lg font-semibold text-[var(--text-h)]">
            {entry ? '编辑条目' : '新建条目'}
          </h2>
        </div>

        {/* 表单内容 */}
        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
          {/* 标题 */}
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">
              标题 <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)]"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="条目标题"
            />
          </div>

          {/* 简介 */}
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">
              简介
              <span className="text-[var(--text)] opacity-50 ml-1 text-xs">（约 50 字，未触发时注入）</span>
            </label>
            <textarea
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="对内容的简短描述，AI 在未触发完整内容时会看到这段文字"
            />
          </div>

          {/* 正文 */}
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">正文</label>
            <textarea
              className="w-full px-3 py-2 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg text-[var(--text-h)] text-sm focus:outline-none focus:border-[var(--accent)] resize-none"
              rows={6}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="触发时注入 AI 上下文的完整内容"
            />
          </div>

          {/* 关键词 */}
          <div>
            <label className="block text-sm text-[var(--text)] mb-1">
              关键词
              <span className="text-[var(--text)] opacity-50 ml-1 text-xs">（回车添加，作为触发关键词）</span>
            </label>
            <div
              className="w-full min-h-[42px] px-2 py-1.5 bg-[var(--code-bg)] border border-[var(--border)] rounded-lg flex flex-wrap gap-1.5 cursor-text focus-within:border-[var(--accent)]"
              onClick={() => kwRef.current?.focus()}
            >
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-[var(--accent-bg)] text-[var(--accent)] text-xs rounded-md"
                >
                  {kw}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeKeyword(kw); }}
                    className="opacity-60 hover:opacity-100 transition-opacity leading-none"
                  >
                    ×
                  </button>
                </span>
              ))}
              <input
                ref={kwRef}
                className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-[var(--text-h)] placeholder:text-[var(--text)] placeholder:opacity-40"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={handleKwKeyDown}
                onBlur={() => { if (kwInput.trim()) addKeyword(kwInput); }}
                placeholder={keywords.length === 0 ? '输入关键词后按回车' : ''}
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        {/* 底部按钮 */}
        <div className="px-6 py-4 border-t border-[var(--border)] flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-[var(--text)] hover:text-[var(--text-h)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
