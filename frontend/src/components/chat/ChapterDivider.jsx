import { useRef, useEffect, useState } from 'react';
import { IconRotateCcw, IconSquarePen } from '../ui/icons.jsx';
import Button from '../ui/Button.jsx';
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
            <Button size="sm" variant="ghost" onClick={cancelEdit}>取消</Button>
            <Button size="sm" onClick={confirmEdit}>保存</Button>
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
                <Button variant="text" size="sm" onClick={startEdit} aria-label="编辑章节标题">
                  <IconSquarePen size={16} />
                  编辑
                </Button>
              )}
              {onRegenerate && (
                <Button variant="text" size="sm" onClick={handleRegenerate} disabled={regenerating} aria-label="重新生成章节标题">
                  {regenerating ? <MotionOrb size={16} /> : (
                    <IconRotateCcw size={16} />
                  )}
                  {regenerating ? '生成中…' : '重新生成'}
                </Button>
              )}
            </div>
          )}
        </>
      )}

      <div className="we-chapter-fleuron">
        <span className="we-chapter-fleuron-line" />
        <span className="we-chapter-fleuron-mark" aria-hidden="true" />
        <span className="we-chapter-fleuron-line" />
      </div>
    </header>
  );
}
