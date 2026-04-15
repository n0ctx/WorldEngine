import { useState, useRef } from 'react';
import MarkdownEditor from '../ui/MarkdownEditor';

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
      <div className="bg-canvas border border-border rounded-2xl shadow-whisper w-full max-w-xl flex flex-col max-h-[90vh]">
        {/* 标题栏 */}
        <div className="px-6 py-5 border-b border-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-text">
            {entry ? '编辑条目' : '新建条目'}
          </h2>
        </div>

        {/* 表单内容 */}
        <div className="px-6 py-5 flex flex-col gap-4 overflow-y-auto">
          {/* 标题 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              标题 <span className="text-red-400">*</span>
            </label>
            <input
              autoFocus
              className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="条目标题"
            />
          </div>

          {/* 简介 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              简介
              <span className="text-text-secondary opacity-50 ml-1 text-xs">（约 50 字，未触发时注入）</span>
            </label>
            <MarkdownEditor
              value={summary}
              onChange={setSummary}
              placeholder="对内容的简短描述，AI 在未触发完整内容时会看到这段文字"
              minHeight={72}
            />
          </div>

          {/* 正文 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">正文</label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="触发时注入 AI 上下文的完整内容"
              minHeight={144}
            />
          </div>

          {/* 关键词 */}
          <div>
            <label className="block text-sm text-text-secondary mb-1">
              关键词
              <span className="text-text-secondary opacity-50 ml-1 text-xs">（回车添加，作为触发关键词）</span>
            </label>
            <div
              className="w-full min-h-[42px] px-2 py-1.5 bg-ivory border border-border rounded-lg flex flex-wrap gap-1.5 cursor-text focus-within:border-accent"
              onClick={() => kwRef.current?.focus()}
            >
              {keywords.map((kw) => (
                <span
                  key={kw}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent/10 text-accent text-xs rounded-md"
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
                className="flex-1 min-w-[80px] bg-transparent outline-none text-sm text-text placeholder:text-text-secondary placeholder:opacity-40"
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
        <div className="px-6 py-4 border-t border-border flex justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-text-secondary hover:text-text transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 text-sm bg-accent text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
