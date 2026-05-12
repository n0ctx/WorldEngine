import { useMemo, useState } from 'react';
import StatusSection from '../state/StatusSection.jsx';
import {
  patchNearbyPersona,
  patchNearbyState,
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

  // StatusSection 读取 effective_value_json；nearby 状态使用 runtime_value_json，
  // 此处做一次映射，不影响后端字段语义。
  const stateRows = useMemo(() => {
    const rows = Array.isArray(nearby?.state) ? nearby.state : [];
    return rows.map((r) => ({
      ...r,
      effective_value_json: r.runtime_value_json ?? null,
    }));
  }, [nearby]);

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

  return (
    <div className="we-cast-character-block we-state-section">
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
            headerless
            gridLayout
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
