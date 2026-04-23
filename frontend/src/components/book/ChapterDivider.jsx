import { useRef, useEffect, useState } from 'react';
import Icon from '../ui/Icon.jsx';

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function toChapterNum(n) {
  return n <= 10 ? CN_NUMS[n - 1] : String(n);
}

/**
 * 章节起始标题（重量级分隔）
 * Props: { chapterIndex, title, isDefault, onEdit, onRegenerate }
 */
export default function ChapterDivider({ chapterIndex, title, isDefault = true, onEdit, onRegenerate }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [hovered, setHovered] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('we-chapter-header--visible');
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function startEdit() {
    setDraft(title);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function confirmEdit() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== title) {
      onEdit?.(trimmed);
    }
    setEditing(false);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') { e.preventDefault(); confirmEdit(); }
    if (e.key === 'Escape') cancelEdit();
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      await onRegenerate?.();
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <header
      ref={ref}
      className="we-chapter-header"
      style={{ position: 'relative' }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="we-chapter-num">第 {toChapterNum(chapterIndex)} 章</div>

      {editing ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0 8px' }}>
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            style={{
              fontFamily: 'var(--we-font-display)',
              fontStyle: 'italic',
              fontWeight: 300,
              fontSize: 'var(--we-text-lg, 1.25rem)',
              textAlign: 'center',
              background: 'var(--we-paper-aged)',
              border: '1px solid var(--we-vermilion)',
              borderRadius: 'var(--we-radius-sm)',
              padding: '2px 10px',
              color: 'var(--we-ink-primary)',
              outline: 'none',
              width: '60%',
              maxWidth: 240,
            }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={cancelEdit}
              style={{
                fontFamily: 'var(--we-font-sans)',
                fontSize: 11,
                color: 'var(--we-ink-faded)',
                background: 'none',
                border: '1px solid var(--we-paper-shadow)',
                borderRadius: 'var(--we-radius-sm)',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >取消</button>
            <button
              onClick={confirmEdit}
              style={{
                fontFamily: 'var(--we-font-sans)',
                fontSize: 11,
                color: 'var(--we-accent)',
                background: 'none',
                border: '1px solid var(--we-accent)',
                borderRadius: 'var(--we-radius-sm)',
                padding: '2px 8px',
                cursor: 'pointer',
              }}
            >保存</button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="we-chapter-title">{title}</h2>
          {hovered && (onEdit || onRegenerate) && (
            <div
              className="we-message-actions"
              style={{
                position: 'absolute',
                right: 0,
                bottom: '100%',
                marginBottom: 4,
                display: 'flex',
              }}
            >
              {onEdit && (
                <button onClick={startEdit}>
                  <Icon size={16}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </Icon>
                  编辑
                </button>
              )}
              {onRegenerate && (
                <button onClick={handleRegenerate} disabled={regenerating}>
                  <Icon size={16}>
                    <polyline points="1 4 1 10 7 10" />
                    <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                  </Icon>
                  {regenerating ? '生成中…' : '重新生成'}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="we-chapter-fleuron">
        <span className="we-chapter-fleuron-line" />
        <span>❦</span>
        <span className="we-chapter-fleuron-line" />
      </div>
    </header>
  );
}
