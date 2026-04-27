import { useState } from 'react';
import ModalShell from '../ui/ModalShell.jsx';

/**
 * 制卡预览确认弹窗
 * 展示 LLM 提取到的角色列表，用户勾选后确认创建。
 */
export default function CharacterPreviewModal({ characters, onConfirm, onClose }) {
  const [selected, setSelected] = useState(() => new Set(characters.map((_, i) => i)));
  const [creating, setCreating] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  function toggle(idx) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === characters.length) setSelected(new Set());
    else setSelected(new Set(characters.map((_, i) => i)));
  }

  async function handleConfirm() {
    const chosen = characters.filter((_, i) => selected.has(i));
    if (chosen.length === 0) return;
    setCreating(true);
    setProgress({ done: 0, total: chosen.length });
    await onConfirm(chosen, (done) => setProgress((p) => ({ ...p, done })));
  }

  const selectedCount = selected.size;

  return (
    <ModalShell onClose={creating ? undefined : onClose} maxWidth="max-w-xl">
      {/* header */}
      <div className="we-dialog-header">
        <h2>提取到以下角色</h2>
      </div>

      {/* body */}
      <div className="we-dialog-body we-character-preview-body">
        {characters.length === 0 ? (
          <p className="we-character-preview-empty">
            未发现新角色
          </p>
        ) : (
          <>
            <div className="we-character-preview-select-row">
              <input
                type="checkbox"
                checked={selectedCount === characters.length}
                ref={(el) => { if (el) el.indeterminate = selectedCount > 0 && selectedCount < characters.length; }}
                onChange={toggleAll}
                disabled={creating}
                className="we-character-preview-checkbox"
              />
              <span className="we-character-preview-count">
                已选 {selectedCount} / {characters.length}
              </span>
            </div>

            {characters.map((char, idx) => (
              <label
                key={idx}
                className={[
                  'we-character-preview-item',
                  selected.has(idx)
                    ? 'we-character-preview-item--selected'
                    : 'we-character-preview-item--muted',
                  creating ? 'we-character-preview-item--disabled' : '',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={selected.has(idx)}
                  onChange={() => toggle(idx)}
                  disabled={creating}
                  className="we-character-preview-checkbox we-character-preview-checkbox--item"
                />
                <div className="we-character-preview-content">
                  <div className="we-character-preview-name">
                    {char.name}
                  </div>
                  {char.description && (
                    <p className="we-character-preview-desc">
                      {char.description}
                    </p>
                  )}
                  {char.system_prompt && (
                    <p className="we-character-preview-prompt">
                      人设：{char.system_prompt}
                    </p>
                  )}
                </div>
              </label>
            ))}
          </>
        )}
      </div>

      {/* footer */}
      <div className="we-dialog-footer">
        {creating && (
          <span className="we-character-preview-progress">
            正在创建 {progress.done} / {progress.total}…
          </span>
        )}
        <button
          onClick={onClose}
          disabled={creating}
          className="we-confirm-cancel"
        >
          取消
        </button>
        <button
          onClick={handleConfirm}
          disabled={creating || selectedCount === 0}
          className="we-confirm-ok"
        >
          {creating ? '创建中…' : `创建选中（${selectedCount}）`}
        </button>
      </div>
    </ModalShell>
  );
}
