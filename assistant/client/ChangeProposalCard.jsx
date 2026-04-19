/**
 * 变更提案卡
 * 显示子代理生成的修改预览，支持用户编辑后应用
 */

import { useState } from 'react';
import { executeProposal } from './api.js';
import { useAssistantStore } from './useAssistantStore.js';
import { refreshCustomCss } from '../../frontend/src/api/customCssSnippets.js';
import { invalidateCache, loadRules } from '../../frontend/src/utils/regex-runner.js';

const OP_LABELS = { create: '新建', update: '修改', delete: '删除' };

const TYPE_LABELS = {
  'world-card': '世界卡',
  'character-card': '角色卡',
  'global-config': '全局设置',
  'css-snippet': '自定义 CSS',
  'regex-rule': '正则规则',
};

const TYPE_ICONS = {
  'world-card': '🌍',
  'character-card': '👤',
  'global-config': '⚙️',
  'css-snippet': '🎨',
  'regex-rule': '🔄',
};

// 长文本字段（用 textarea）
const TEXTAREA_KEYS = new Set([
  'system_prompt', 'post_prompt', 'first_message',
  'global_system_prompt', 'global_post_prompt',
  'content', 'update_instruction', 'description',
]);

// 通用输入样式
const inputBase = {
  width: '100%',
  boxSizing: 'border-box',
  fontSize: '12px',
  fontFamily: 'inherit',
  color: 'var(--we-ink-primary)',
  background: 'var(--we-paper-base, #f4ede4)',
  border: '1px solid rgba(201,168,90,0.4)',
  borderRadius: '3px',
  padding: '4px 6px',
  outline: 'none',
  lineHeight: '1.5',
};

// ── 子组件：单个 changes 字段编辑行 ─────────────────────────────
function ChangeField({ fieldKey, value, onChange }) {
  const isTextarea = TEXTAREA_KEYS.has(fieldKey);
  const isNumber = typeof value === 'number';
  return (
    <div style={{ marginBottom: '8px' }}>
      <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '3px', fontFamily: 'monospace' }}>
        {fieldKey}
      </div>
      {isTextarea ? (
        <textarea
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value)}
          rows={Math.min(12, Math.max(3, (String(value || '')).split('\n').length + 1))}
          style={{ ...inputBase, resize: 'vertical' }}
        />
      ) : (
        <input
          type={isNumber ? 'number' : 'text'}
          value={value ?? ''}
          onChange={(e) => onChange(isNumber ? (e.target.value === '' ? null : Number(e.target.value)) : e.target.value)}
          style={inputBase}
        />
      )}
    </div>
  );
}

// ── 子组件：单个 entryOp 编辑行 ──────────────────────────────────
function EntryOpEditor({ op, onChange, onRemove }) {
  const opColor = op.op === 'delete' ? '#c0392b' : op.op === 'update' ? '#7a5c1e' : '#2e7a4a';
  const opLabelStr = op.op === 'delete' ? '删除' : op.op === 'update' ? '修改' : '新增';

  return (
    <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: opColor, fontWeight: 700 }}>[{opLabelStr}]</span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--we-ink-muted)', padding: '0 2px', lineHeight: 1 }}
          title="移除此条目"
        >×</button>
      </div>
      {op.op !== 'delete' ? (
        <>
          <input
            placeholder="标题"
            value={op.title || ''}
            onChange={(e) => onChange({ ...op, title: e.target.value })}
            style={{ ...inputBase, marginBottom: '4px' }}
          />
          <input
            placeholder="简介（50字以内，始终注入）"
            value={op.summary || ''}
            onChange={(e) => onChange({ ...op, summary: e.target.value })}
            style={{ ...inputBase, marginBottom: '4px' }}
          />
          <textarea
            placeholder="详细内容（触发时注入）"
            value={op.content || ''}
            onChange={(e) => onChange({ ...op, content: e.target.value })}
            rows={4}
            style={{ ...inputBase, resize: 'vertical', marginBottom: '4px' }}
          />
          <input
            placeholder="关键词（逗号分隔，留空=向量检索）"
            value={Array.isArray(op.keywords) ? op.keywords.join(', ') : (op.keywords || '')}
            onChange={(e) => {
              const kws = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
              onChange({ ...op, keywords: kws.length ? kws : null });
            }}
            style={inputBase}
          />
        </>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--we-ink-muted)' }}>删除 ID: {op.id}</div>
      )}
    </div>
  );
}

// ── 子组件：单个 stateFieldOp 编辑行 ─────────────────────────────
function StateFieldOpEditor({ op, onChange, onRemove }) {
  const isDelete = op.op === 'delete';
  const opColor = isDelete ? '#c0392b' : '#2e5a8a';
  const typeMap = { number: '数值', text: '文本', enum: '枚举', list: '列表', boolean: '布尔' };

  return (
    <div style={{ marginBottom: '8px', padding: '6px 8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
        <span style={{ fontSize: '10px', color: opColor, fontWeight: 700 }}>[{isDelete ? '删除' : '新增'}] {op.label || op.field_key}</span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--we-ink-muted)', padding: '0 2px', lineHeight: 1 }}
          title="移除此条目"
        >×</button>
      </div>
      {!isDelete ? (
        <>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
            <input
              placeholder="标识符 (field_key)"
              value={op.field_key || ''}
              onChange={(e) => onChange({ ...op, field_key: e.target.value })}
              style={{ ...inputBase, flex: 1, fontFamily: 'monospace', fontSize: '11px' }}
            />
            <select
              value={op.type || 'text'}
              onChange={(e) => onChange({ ...op, type: e.target.value })}
              style={{ ...inputBase, width: 'auto', flex: '0 0 60px', cursor: 'pointer' }}
            >
              {Object.entries(typeMap).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <input
            placeholder="显示名称（中文）"
            value={op.label || ''}
            onChange={(e) => onChange({ ...op, label: e.target.value })}
            style={{ ...inputBase, marginBottom: '4px' }}
          />
          <input
            placeholder="说明（告诉 LLM 这个字段追踪什么）"
            value={op.description || ''}
            onChange={(e) => onChange({ ...op, description: e.target.value })}
            style={{ ...inputBase, marginBottom: '4px' }}
          />
          <input
            placeholder="更新指令（LLM 如何更新这个字段）"
            value={op.update_instruction || ''}
            onChange={(e) => onChange({ ...op, update_instruction: e.target.value })}
            style={{ ...inputBase, marginBottom: '4px' }}
          />
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              placeholder="默认值（JSON 字符串）"
              value={op.default_value ?? ''}
              onChange={(e) => onChange({ ...op, default_value: e.target.value })}
              style={{ ...inputBase, flex: 1 }}
            />
            {op.type === 'number' && (
              <>
                <input type="number" placeholder="最小" value={op.min_value ?? ''} onChange={(e) => onChange({ ...op, min_value: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inputBase, width: '52px' }} />
                <input type="number" placeholder="最大" value={op.max_value ?? ''} onChange={(e) => onChange({ ...op, max_value: e.target.value === '' ? null : Number(e.target.value) })} style={{ ...inputBase, width: '52px' }} />
              </>
            )}
          </div>
          {op.type === 'enum' && (
            <input
              placeholder="枚举选项（逗号分隔）"
              value={Array.isArray(op.enum_options) ? op.enum_options.join(', ') : (op.enum_options || '')}
              onChange={(e) => {
                const opts = e.target.value.split(',').map(s => s.trim()).filter(Boolean);
                onChange({ ...op, enum_options: opts });
              }}
              style={{ ...inputBase, marginTop: '4px' }}
            />
          )}
        </>
      ) : (
        <div style={{ fontSize: '12px', color: 'var(--we-ink-muted)' }}>删除 ID: {op.id}</div>
      )}
    </div>
  );
}

// ── 主组件 ────────────────────────────────────────────────────────

export default function ChangeProposalCard({ messageId, taskId, token, proposal, applied }) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);

  // 本地编辑态
  const [localChanges, setLocalChanges] = useState({});
  const [localEntryOps, setLocalEntryOps] = useState([]);
  const [localStateFieldOps, setLocalStateFieldOps] = useState([]);

  const markApplied = useAssistantStore((s) => s.markProposalApplied);
  const setResolvedId = useAssistantStore((s) => s.setResolvedId);
  const resolvedIds = useAssistantStore((s) => s.resolvedIds);

  if (!proposal) return null;

  const typeLabel = TYPE_LABELS[proposal.type] || proposal.type;
  const icon = TYPE_ICONS[proposal.type] || '📝';
  const operation = proposal.operation || 'update';
  const opLabel = OP_LABELS[operation] || operation;

  const worldRef = proposal.worldRef;
  const worldRefId = worldRef ? resolvedIds[worldRef] : null;
  const waitingForWorld = operation === 'create' && proposal.type === 'character-card' && worldRef && !worldRefId;

  // 原始计算值
  const baseEntryOps = (() => {
    if (Array.isArray(proposal.entryOps) && proposal.entryOps.length > 0) return proposal.entryOps;
    if (Array.isArray(proposal.newEntries) && proposal.newEntries.length > 0) {
      return proposal.newEntries.map((e) => ({ op: 'create', ...e }));
    }
    return [];
  })();
  const baseStateFieldOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps : [];

  // 编辑模式生效值
  const effectiveChanges = editing ? localChanges : (proposal.changes || {});
  const effectiveEntryOps = editing ? localEntryOps : baseEntryOps;
  const effectiveStateFieldOps = editing ? localStateFieldOps : baseStateFieldOps;

  const changesEntries = Object.entries(effectiveChanges).filter(([, v]) => v !== null && v !== undefined);
  const hasEntryOps = effectiveEntryOps.length > 0;

  function startEditing() {
    setLocalChanges(JSON.parse(JSON.stringify(proposal.changes || {})));
    setLocalEntryOps(JSON.parse(JSON.stringify(baseEntryOps)));
    setLocalStateFieldOps(JSON.parse(JSON.stringify(baseStateFieldOps)));
    setEditing(true);
    setError(null);
  }

  function cancelEditing() {
    setEditing(false);
    setError(null);
  }

  async function handleApply() {
    if (waitingForWorld) return;
    setApplying(true);
    setError(null);
    try {
      const edited = editing
        ? { changes: localChanges, entryOps: localEntryOps, stateFieldOps: localStateFieldOps }
        : undefined;
      const res = await executeProposal(token, worldRefId || undefined, edited);
      markApplied(messageId);
      if (operation === 'create' && res?.result?.id && taskId) {
        setResolvedId(taskId, res.result.id);
      }
      if (proposal.type === 'css-snippet') {
        await refreshCustomCss();
      } else if (proposal.type === 'regex-rule') {
        invalidateCache();
        await loadRules();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setApplying(false);
    }
  }

  const canEdit = !applied && operation !== 'delete';

  return (
    <div
      style={{
        margin: '6px 0',
        border: editing ? '1px solid rgba(201,168,90,0.5)' : '1px solid rgba(201,168,90,0.25)',
        borderRadius: '6px',
        overflow: 'hidden',
        background: 'var(--we-paper-aged, #ede6da)',
        fontSize: '13px',
      }}
    >
      {/* 头部 */}
      <div
        style={{
          padding: '8px 12px',
          background: editing ? 'rgba(201,168,90,0.18)' : 'rgba(201,168,90,0.1)',
          borderBottom: '1px solid rgba(201,168,90,0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}
      >
        <span>{icon}</span>
        <span
          style={{
            fontFamily: 'var(--we-font-display)',
            fontStyle: 'italic',
            color: 'var(--we-ink-primary)',
            fontWeight: 500,
          }}
        >
          {typeLabel}{opLabel}预览
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {applied && (
            <span
              style={{
                fontSize: '11px',
                color: '#5a8a5a',
                background: 'rgba(90,138,90,0.12)',
                padding: '1px 6px',
                borderRadius: '3px',
              }}
            >
              已应用
            </span>
          )}
          {editing && (
            <span
              style={{
                fontSize: '11px',
                color: 'var(--we-vermilion, #8a5e4a)',
                background: 'rgba(138,94,74,0.1)',
                padding: '1px 6px',
                borderRadius: '3px',
              }}
            >
              编辑中
            </span>
          )}
        </div>
      </div>

      {/* 说明 */}
      {proposal.explanation && (
        <div
          style={{
            padding: '7px 12px',
            color: 'var(--we-ink-secondary, #6b5a4e)',
            fontSize: '12px',
            borderBottom: changesEntries.length > 0 || hasEntryOps || effectiveStateFieldOps.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none',
          }}
        >
          {proposal.explanation}
        </div>
      )}

      {/* 字段变更（delete 不显示） */}
      {operation !== 'delete' && changesEntries.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: hasEntryOps || effectiveStateFieldOps.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
          {editing
            ? Object.keys(localChanges).map((key) => (
                <ChangeField
                  key={key}
                  fieldKey={key}
                  value={localChanges[key]}
                  onChange={(v) => setLocalChanges((prev) => ({ ...prev, [key]: v }))}
                />
              ))
            : changesEntries.map(([key, value]) => (
                <div key={key} style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '2px', fontFamily: 'monospace' }}>
                    {key}
                  </div>
                  <div
                    style={{
                      color: 'var(--we-ink-primary)',
                      fontSize: '12px',
                      lineHeight: '1.5',
                      background: 'rgba(0,0,0,0.03)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      maxHeight: '120px',
                      overflowY: 'auto',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                    {typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)}
                  </div>
                </div>
              ))}
        </div>
      )}

      {/* Prompt 条目 */}
      {operation !== 'delete' && hasEntryOps && (
        <div style={{ padding: '6px 12px', borderBottom: effectiveStateFieldOps.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
          <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '4px' }}>
            Prompt 条目变更（{effectiveEntryOps.length} 项）
          </div>
          {editing
            ? localEntryOps.map((op, i) => (
                <EntryOpEditor
                  key={i}
                  op={op}
                  onChange={(updated) => setLocalEntryOps((prev) => prev.map((o, idx) => idx === i ? updated : o))}
                  onRemove={() => setLocalEntryOps((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))
            : effectiveEntryOps.map((op, i) => {
                const eOpLabel = op.op === 'delete' ? '删除' : op.op === 'update' ? '修改' : '新增';
                const eOpColor = op.op === 'delete' ? '#c0392b' : op.op === 'update' ? '#7a5c1e' : '#2e7a4a';
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: '12px',
                      color: 'var(--we-ink-primary)',
                      background: 'rgba(0,0,0,0.03)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      marginBottom: '3px',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: eOpColor, fontWeight: 600, flexShrink: 0 }}>[{eOpLabel}]</span>
                    <strong>{op.title || op.id}</strong>
                    {op.summary && <span style={{ color: 'var(--we-ink-secondary)' }}>— {op.summary}</span>}
                  </div>
                );
              })}
        </div>
      )}

      {/* 状态字段 */}
      {operation !== 'delete' && effectiveStateFieldOps.length > 0 && (
        <div style={{ padding: '6px 12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '4px' }}>
            状态字段变更（{effectiveStateFieldOps.length} 项）
          </div>
          {editing
            ? localStateFieldOps.map((op, i) => (
                <StateFieldOpEditor
                  key={i}
                  op={op}
                  onChange={(updated) => setLocalStateFieldOps((prev) => prev.map((o, idx) => idx === i ? updated : o))}
                  onRemove={() => setLocalStateFieldOps((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))
            : effectiveStateFieldOps.map((op, i) => {
                const sfOpLabel = op.op === 'delete' ? '删除' : '新增';
                const sfOpColor = op.op === 'delete' ? '#c0392b' : '#2e5a8a';
                const typeMap = { number: '数值', text: '文本', enum: '枚举', list: '列表', boolean: '布尔' };
                return (
                  <div
                    key={i}
                    style={{
                      fontSize: '12px',
                      color: 'var(--we-ink-primary)',
                      background: 'rgba(0,0,0,0.03)',
                      padding: '4px 8px',
                      borderRadius: '3px',
                      marginBottom: '3px',
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: '6px',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: sfOpColor, fontWeight: 600, flexShrink: 0 }}>[{sfOpLabel}]</span>
                    <strong>{op.label || op.field_key || op.id}</strong>
                    {op.type && <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)', background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: '2px' }}>{typeMap[op.type] || op.type}</span>}
                    {op.description && <span style={{ color: 'var(--we-ink-secondary)' }}>— {op.description}</span>}
                  </div>
                );
              })}
        </div>
      )}

      {/* 操作按钮 */}
      {!applied && (
        <div
          style={{
            padding: '8px 12px',
            display: 'flex',
            gap: '8px',
            alignItems: 'center',
            borderTop: '1px solid rgba(0,0,0,0.06)',
            flexWrap: 'wrap',
          }}
        >
          {canEdit && !editing && (
            <button
              onClick={startEditing}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                fontFamily: 'var(--we-font-display)',
                fontStyle: 'italic',
                background: 'rgba(0,0,0,0.07)',
                color: 'var(--we-ink-secondary, #6b5a4e)',
                border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              编辑
            </button>
          )}
          {editing && (
            <button
              onClick={cancelEditing}
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                fontFamily: 'var(--we-font-display)',
                fontStyle: 'italic',
                background: 'rgba(0,0,0,0.07)',
                color: 'var(--we-ink-secondary, #6b5a4e)',
                border: '1px solid rgba(0,0,0,0.12)',
                borderRadius: '3px',
                cursor: 'pointer',
              }}
            >
              取消编辑
            </button>
          )}
          <button
            onClick={handleApply}
            disabled={applying || waitingForWorld}
            title={waitingForWorld ? '请先应用对应的世界卡' : undefined}
            style={{
              padding: '4px 14px',
              fontSize: '12px',
              fontFamily: 'var(--we-font-display)',
              fontStyle: 'italic',
              background: waitingForWorld
                ? 'rgba(0,0,0,0.15)'
                : applying
                  ? 'rgba(138,94,74,0.4)'
                  : operation === 'delete'
                    ? '#c0392b'
                    : 'var(--we-vermilion, #8a5e4a)',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: applying || waitingForWorld ? 'default' : 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {applying
              ? '执行中...'
              : waitingForWorld
                ? '等待世界卡'
                : operation === 'create'
                  ? '创建'
                  : operation === 'delete'
                    ? '确认删除'
                    : '应用'}
          </button>
          {error && (
            <span style={{ fontSize: '11px', color: '#c0392b' }}>
              {error}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
