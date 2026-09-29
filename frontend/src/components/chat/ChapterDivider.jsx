import { useRef, useEffect, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import MotionOrb from '../motion/MotionOrb.jsx';
import ChangeText from '../motion/ChangeText.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';
import { handleInlineRenameKeyDown } from '../../core/utils/inline-rename.js';

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function toChapterNum(n) {
  return n <= 10 ? CN_NUMS[n - 1] : String(n);
}

/**
 * 章节起始标题（重量级分隔）
 * Props: { chapterIndex, title, onEdit, onRegenerate }
 */
export default function ChapterDivider({ chapterIndex, title, onEdit, onRegenerate }) {
  const ref = useRef(null);
  const inputRef = useRef(null);
  const [visible, setVisible] = useState(false);
  const [editing, setEditing] = useState(false);
  const fxVars = useMotion().fx();
  const [draft, setDraft] = useState('');
  const [regenerating, setRegenerating] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
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
    handleInlineRenameKeyDown(e, confirmEdit, cancelEdit);
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
      className={`we-chapter-header${visible ? ' we-chapter-header--visible' : ''}`}
      style={fxVars ?? undefined}
    >
      <div className="we-chapter-num">
        <ChangeText text={`第 ${toChapterNum(chapterIndex)} 章`} playKey={visible ? chapterIndex : null} decode />
      </div>

      {editing ? (
        <div className="we-chapter-edit">
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            className="we-chapter-edit-input"
          />
          <div className="we-chapter-edit-actions">
            <button onClick={cancelEdit} className="we-chapter-edit-btn">取消</button>
            <button onClick={confirmEdit} className="we-chapter-edit-btn we-chapter-edit-btn--primary">保存</button>
          </div>
        </div>
      ) : (
        <>
          <h2 className="we-chapter-title">
            <ChangeText text={title} playKey={visible ? title : null} decode />
          </h2>
          {(onEdit || onRegenerate) && (
            <div className="we-chapter-actions">
              {onEdit && (
                <button onClick={startEdit} aria-label="编辑章节标题">
                  <Icon size={16}>
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </Icon>
                  编辑
                </button>
              )}
              {onRegenerate && (
                <button onClick={handleRegenerate} disabled={regenerating} aria-label="重新生成章节标题">
                  {regenerating ? <MotionOrb size={16} /> : (
                    <Icon size={16}>
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                    </Icon>
                  )}
                  {regenerating ? '生成中…' : '重新生成'}
                </button>
              )}
            </div>
          )}
        </>
      )}

      <div className="we-chapter-fleuron">
        <span className="we-chapter-fleuron-line" />
        <span aria-hidden="true">▞</span>
        <span className="we-chapter-fleuron-line" />
      </div>
    </header>
  );
}
