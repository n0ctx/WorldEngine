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
      <div className="we-dialog-panel w-full max-w-xl flex flex-col max-h-[90vh]">
        <div className="we-dialog-header">
          <h2>{entry ? '编辑条目' : '新建条目'}</h2>
        </div>

        <div className="we-dialog-body flex flex-col gap-4">
          <div>
            <label className="we-dialog-label">
              标题 <span style={{ color: 'var(--we-vermilion)' }}>*</span>
            </label>
            <input
              autoFocus
              className="we-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="条目标题"
            />
          </div>

          <div>
            <label className="we-dialog-label">
              简介
              <span className="we-dialog-hint">（约 50 字，未触发时注入）</span>
            </label>
            <MarkdownEditor
              value={summary}
              onChange={setSummary}
              placeholder="对内容的简短描述，AI 在未触发完整内容时会看到这段文字"
              minHeight={72}
            />
          </div>

          <div>
            <label className="we-dialog-label">正文</label>
            <MarkdownEditor
              value={content}
              onChange={setContent}
              placeholder="触发时注入 AI 上下文的完整内容"
              minHeight={144}
            />
          </div>

          <div>
            <label className="we-dialog-label">
              关键词
              <span className="we-dialog-hint">（回车添加，作为触发关键词）</span>
            </label>
            <div className="we-tag-input" onClick={() => kwRef.current?.focus()}>
              {keywords.map((kw) => (
                <span key={kw} className="we-tag">
                  {kw}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); removeKeyword(kw); }}
                  >×</button>
                </span>
              ))}
              <input
                ref={kwRef}
                className="we-tag-input-field"
                value={kwInput}
                onChange={(e) => setKwInput(e.target.value)}
                onKeyDown={handleKwKeyDown}
                onBlur={() => { if (kwInput.trim()) addKeyword(kwInput); }}
                placeholder={keywords.length === 0 ? '输入关键词后按回车' : ''}
              />
            </div>
          </div>

          {error && (
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-vermilion)' }}>
              {error}
            </p>
          )}
        </div>

        <div className="we-dialog-footer">
          <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary">取消</button>
          <button onClick={handleSave} disabled={saving} className="we-btn we-btn-sm we-btn-primary">
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
