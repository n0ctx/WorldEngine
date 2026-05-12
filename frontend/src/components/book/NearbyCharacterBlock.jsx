import { useMemo, useState } from 'react';
import StatusSection from './StatusSection.jsx';
import {
  setNearbySaved,
  patchNearbyPersona,
  patchNearbyState,
  removeNearby,
} from '../../api/session-nearby.js';
import { log } from '../../utils/logger.js';

/**
 * NearbyCharacterBlock — 单个 nearby 角色块（不折叠，常驻展开）。
 *
 * Props:
 *  - worldId, sessionId, nearby（含 state[] 数组）
 *  - onChange: 任意写操作完成后通知父组件刷新 nearby 列表
 *  - templateCtx: StatusSection 模板上下文
 */
export default function NearbyCharacterBlock({
  worldId,
  sessionId,
  nearby,
  onChange,
  templateCtx,
}) {
  const [editingPersona, setEditingPersona] = useState(false);
  const [personaDraft, setPersonaDraft] = useState(nearby?.persona ?? '');
  const [busy, setBusy] = useState(false);

  // StatusSection 读取 effective_value_json；nearby 状态使用 runtime_value_json，
  // 此处做一次映射，不影响后端字段语义。
  const stateRows = useMemo(() => {
    const rows = Array.isArray(nearby?.state) ? nearby.state : [];
    return rows.map((r) => ({
      ...r,
      effective_value_json: r.runtime_value_json ?? null,
    }));
  }, [nearby]);

  async function handleToggleSaved(e) {
    e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      await setNearbySaved(worldId, sessionId, nearby.id, !nearby.is_saved);
      onChange?.();
    } catch (err) {
      log.error('nearby.toggle_failed', err, { toast: err?.message || '切换保存失败' });
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(e) {
    e?.stopPropagation?.();
    if (busy) return;
    setBusy(true);
    try {
      await removeNearby(worldId, sessionId, nearby.id);
      onChange?.();
    } catch (err) {
      log.error('nearby.remove_failed', err, { toast: err?.message || '移除失败' });
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveState(fieldKey, valueJson) {
    try {
      await patchNearbyState(worldId, sessionId, nearby.id, fieldKey, valueJson);
      onChange?.();
    } catch (err) {
      log.error('nearby.state.update_failed', err, { toast: err?.message || '更新状态失败' });
    }
  }

  async function handleSavePersona() {
    try {
      await patchNearbyPersona(worldId, sessionId, nearby.id, personaDraft);
      setEditingPersona(false);
      onChange?.();
    } catch (err) {
      log.error('nearby.persona.update_failed', err, { toast: err?.message || '更新人设失败' });
    }
  }

  const isSaved = Number(nearby?.is_saved) === 1;

  return (
    <div className="we-cast-character-block we-state-section">
      <div className="we-state-section-title">
        <span className={`we-section-label${isSaved ? ' we-section-label--saved' : ''}`}>{nearby?.name || '（未命名）'}</span>
        <span className="we-section-rule" />
        {isSaved ? (
          <button
            type="button"
            className="we-state-section-reset"
            onClick={handleToggleSaved}
            disabled={busy}
            aria-label={`取消保存 ${nearby?.name || ''}`}
            title="取消保存（保留记录，下轮仍注入）"
          >
            取消
          </button>
        ) : (
          <>
            <button
              type="button"
              className="we-state-section-reset"
              onClick={handleToggleSaved}
              disabled={busy}
              aria-label={`保存 ${nearby?.name || ''}`}
              title="保存到附近角色池"
            >
              保存
            </button>
            <button
              type="button"
              className="we-state-section-reset ml-1"
              onClick={handleRemove}
              disabled={busy}
              aria-label={`移除 ${nearby?.name || ''}`}
              title="移除（物理删除，下轮不再注入）"
            >
              移除
            </button>
          </>
        )}
      </div>

      <div>
        <div>
          {/* 人设段 */}
          <div className="we-state-section-title">
            <span className="we-section-label">人设</span>
          </div>
          <div className="we-nearby-persona">
            {editingPersona ? (
              <div className="we-nearby-persona-edit">
                <textarea
                  className="we-input"
                  value={personaDraft}
                  onChange={(ev) => setPersonaDraft(ev.target.value)}
                  rows={3}
                  placeholder="一句话人物设定（性格 / 身份 / 关键标签）…"
                />
                <div className="we-nearby-persona-actions">
                  <button
                    type="button"
                    className="we-state-section-reset"
                    onClick={handleSavePersona}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="we-state-section-reset"
                    onClick={() => {
                      setEditingPersona(false);
                      setPersonaDraft(nearby?.persona ?? '');
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <span
                className="we-nearby-persona-text"
                onClick={() => {
                  setPersonaDraft(nearby?.persona ?? '');
                  setEditingPersona(true);
                }}
                title="点击编辑人设"
              >
                {nearby?.persona || '（无人设）'}
              </span>
            )}
          </div>

          <StatusSection
            title=""
            rows={stateRows}
            onSave={handleSaveState}
            className="we-cast-char-inner"
            templateCtx={{ ...(templateCtx ?? {}), char: nearby?.name ?? '' }}
          />
        </div>
      </div>
    </div>
  );
}
