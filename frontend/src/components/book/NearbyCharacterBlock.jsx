import { useMemo, useState } from 'react';
import Icon from '../ui/Icon.jsx';
import StatusSection from './StatusSection.jsx';
import {
  setNearbySaved,
  patchNearbyMemory,
  patchNearbyState,
  removeNearby,
} from '../../api/session-nearby.js';
import { pushErrorToast } from '../../utils/toast.js';

function Chevron({ open }) {
  return (
    <Icon
      size={16}
      viewBox="0 0 10 10"
      strokeWidth="2.5"
      className="we-cast-chevron"
      style={{
        flexShrink: 0,
        transition: 'transform 0.2s ease',
        transform: open ? 'rotate(0deg)' : 'rotate(-90deg)',
      }}
    >
      <polyline points="2,3.5 5,6.5 8,3.5" />
    </Icon>
  );
}

function SealDot() {
  return <span className="we-nearby-seal" aria-label="已保存" title="已保存" />;
}

/**
 * NearbyCharacterBlock — 单个 nearby 角色块。
 *
 * Props:
 *  - worldId, sessionId, nearby（含 state[] 数组）
 *  - expanded, onToggle: 折叠状态由父组件控制
 *  - onChange: 任意写操作完成后通知父组件刷新 nearby 列表
 *  - templateCtx: StatusSection 模板上下文
 */
export default function NearbyCharacterBlock({
  worldId,
  sessionId,
  nearby,
  expanded,
  onToggle,
  onChange,
  templateCtx,
}) {
  const [editingMemory, setEditingMemory] = useState(false);
  const [memoryDraft, setMemoryDraft] = useState(nearby?.memory ?? '');
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
      pushErrorToast(err?.message || '切换保存失败');
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
      pushErrorToast(err?.message || '移除失败');
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveState(fieldKey, valueJson) {
    try {
      await patchNearbyState(worldId, sessionId, nearby.id, fieldKey, valueJson);
      onChange?.();
    } catch (err) {
      pushErrorToast(err?.message || '更新状态失败');
    }
  }

  async function handleSaveMemory() {
    try {
      await patchNearbyMemory(worldId, sessionId, nearby.id, memoryDraft);
      setEditingMemory(false);
      onChange?.();
    } catch (err) {
      pushErrorToast(err?.message || '更新记忆失败');
    }
  }

  const isSaved = Number(nearby?.is_saved) === 1;

  return (
    <div className="we-cast-character-block we-state-section">
      <div
        className="we-state-section-title"
        style={{ cursor: 'pointer', userSelect: 'none' }}
        onClick={onToggle}
      >
        <Chevron open={expanded} />
        {isSaved && <SealDot />}
        <span className="we-section-label">{nearby?.name || '（未命名）'}</span>
        <span className="we-section-rule" />
        {isSaved ? (
          <button
            type="button"
            className="we-state-section-reset"
            onClick={handleRemove}
            disabled={busy}
            aria-label={`移除 ${nearby?.name || ''}`}
            title="移除"
          >
            移除
          </button>
        ) : (
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
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateRows: expanded ? '1fr' : '0fr',
          transition: 'grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflow: 'hidden', minHeight: 0 }}>
          {/* 记忆段 */}
          <div className="we-state-section-title">
            <span className="we-section-label">记忆</span>
            <span className="we-section-rule" />
          </div>
          <div className="we-nearby-memory">
            {editingMemory ? (
              <div className="we-nearby-memory-edit">
                <textarea
                  className="we-input"
                  value={memoryDraft}
                  onChange={(ev) => setMemoryDraft(ev.target.value)}
                  rows={3}
                  placeholder="对该角色的记忆…"
                />
                <div className="we-nearby-memory-actions">
                  <button
                    type="button"
                    className="we-state-section-reset"
                    onClick={handleSaveMemory}
                  >
                    保存
                  </button>
                  <button
                    type="button"
                    className="we-state-section-reset"
                    onClick={() => {
                      setEditingMemory(false);
                      setMemoryDraft(nearby?.memory ?? '');
                    }}
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <span
                className="we-nearby-memory-text"
                onClick={() => {
                  setMemoryDraft(nearby?.memory ?? '');
                  setEditingMemory(true);
                }}
                title="点击编辑记忆"
              >
                {nearby?.memory || '（无记忆）'}
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
