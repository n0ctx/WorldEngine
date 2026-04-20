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
  const [description, setDescription] = useState(entry?.description ?? '');
  const [content, setContent] = useState(entry?.content ?? '');
  const [keywords, setKeywords] = useState(
    Array.isArray(entry?.keywords) ? entry.keywords : (entry?.keywords ?? [])
  );
  const initialKeywordScope = typeof entry?.keyword_scope === 'string'
    ? entry.keyword_scope.trim().toLowerCase()
    : '';
  const normalizedScope = initialKeywordScope === 'both' || initialKeywordScope === ''
    ? ['user', 'assistant']
    : initialKeywordScope
        .split(',')
        .map((item) => item.trim())
        .filter((item, index, arr) => (item === 'user' || item === 'assistant') && arr.indexOf(item) === index);
  const [keywordScopes, setKeywordScopes] = useState(normalizedScope);
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

  function toggleKeywordScope(scope) {
    setKeywordScopes((prev) => (
      prev.includes(scope)
        ? prev.filter((item) => item !== scope)
        : [...prev, scope]
    ));
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
        description,
        content,
        keywords: keywords.length > 0 ? keywords : null,
        keyword_scope: keywordScopes.join(','),
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
              触发条件
              <span className="we-dialog-hint">（1-2句话，描述该条目的触发时机）</span>
            </label>
            <MarkdownEditor
              value={description}
              onChange={setDescription}
              placeholder="例：当对话涉及魔法、施法或能量消耗时展开此条目"
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
              关键词兜底
              <span className="we-dialog-hint">（回车添加，LLM 未触发时按关键词兜底）</span>
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
            <div className="we-scope-row">
              <label className="we-scope-check">
                <input
                  type="checkbox"
                  className="we-checkbox"
                  checked={keywordScopes.includes('user')}
                  onChange={() => toggleKeywordScope('user')}
                />
                用户消息
              </label>
              <label className="we-scope-check">
                <input
                  type="checkbox"
                  className="we-checkbox"
                  checked={keywordScopes.includes('assistant')}
                  onChange={() => toggleKeywordScope('assistant')}
                />
                AI 消息
              </label>
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
