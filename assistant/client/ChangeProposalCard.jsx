/**
 * 变更提案卡
 * 显示子代理生成的修改预览，支持用户编辑后应用
 */

import { useEffect, useState } from 'react';
import { executeProposal } from './api.js';
import { useAssistantStore } from './useAssistantStore.js';
import useStore from '../../frontend/src/store/index.js';
import { refreshCustomCss } from '../../frontend/src/api/custom-css-snippets.js';
import { invalidateCache, loadRules } from '../../frontend/src/utils/regex-runner.js';
import { listWorldStateFields } from '../../frontend/src/api/world-state-fields.js';
import { listCharacterStateFields } from '../../frontend/src/api/character-state-fields.js';
import { listPersonaStateFields } from '../../frontend/src/api/persona-state-fields.js';

const OP_LABELS = { create: '新建', update: '修改', delete: '删除' };

const TYPE_LABELS = {
  'world-card': '世界卡',
  'character-card': '角色卡',
  'persona-card': '玩家卡',
  'global-config': '全局设置',
  'css-snippet': '自定义 CSS',
  'regex-rule': '正则规则',
};

const TYPE_ICONS = {
  'world-card': '🌍',
  'character-card': '👤',
  'persona-card': '🎭',
  'global-config': '⚙️',
  'css-snippet': '🎨',
  'regex-rule': '🔄',
};

const TEXTAREA_KEYS = new Set([
  'system_prompt', 'post_prompt', 'first_message',
  'global_system_prompt', 'global_post_prompt',
  'content', 'update_instruction', 'description',
]);

const STATE_TYPE_LABELS = { number: '数值', text: '文本', enum: '枚举', list: '列表', boolean: '布尔' };
const UPDATE_MODE_LABELS = { manual: '手动', llm_auto: 'LLM 自动' };
const TRIGGER_MODE_LABELS = { manual_only: '手动', every_turn: '每轮', keyword_based: '关键词' };
const ENTRY_TRIGGER_LABELS = { always: '常驻', keyword: '关键词', llm: 'AI 判断', state: '状态条件' };

const ENTRY_TRIGGER_OPTIONS = [
  { value: 'always', label: '常驻' },
  { value: 'keyword', label: '关键词' },
  { value: 'llm', label: 'AI 判断' },
  { value: 'state', label: '状态条件' },
];

const KEYWORD_SCOPE_OPTIONS = [
  { value: 'user,assistant', label: '用户 + AI' },
  { value: 'user', label: '仅用户' },
  { value: 'assistant', label: '仅 AI' },
];

const STATE_FIELD_TARGET_OPTIONS = [
  { value: 'world', label: '世界' },
  { value: 'persona', label: '玩家' },
  { value: 'character', label: '角色' },
];

const STATE_FIELD_TYPE_OPTIONS = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数值' },
  { value: 'boolean', label: '布尔' },
  { value: 'enum', label: '枚举' },
  { value: 'list', label: '列表' },
];

const UPDATE_MODE_OPTIONS = [
  { value: 'manual', label: '手动' },
  { value: 'llm_auto', label: 'LLM 自动' },
];

const TRIGGER_MODE_OPTIONS = [
  { value: 'manual_only', label: '手动' },
  { value: 'every_turn', label: '每轮' },
  { value: 'keyword_based', label: '关键词' },
];

const NUMERIC_CONDITION_OPTIONS = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '=', label: '=' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '!=', label: '!=' },
];

const TEXT_CONDITION_OPTIONS = [
  { value: '包含', label: '包含' },
  { value: '等于', label: '等于' },
  { value: '不包含', label: '不包含' },
];

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

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function parseCommaSeparated(value) {
  if (!value) return null;
  const items = String(value).split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : null;
}

function normalizeEntryOp(op) {
  const triggerType = op.trigger_type || 'always';
  return {
    ...op,
    trigger_type: triggerType,
    keyword_scope: op.keyword_scope || 'user,assistant',
    token: Number.isFinite(Number(op.token)) && Number(op.token) >= 1 ? Number(op.token) : 1,
    keywords: Array.isArray(op.keywords) ? op.keywords : null,
    conditions: triggerType === 'state'
      ? Array.isArray(op.conditions) ? op.conditions.map((cond) => ({
          target_field: cond.target_field || '',
          operator: cond.operator || '等于',
          value: cond.value ?? '',
        })) : []
      : undefined,
  };
}

function normalizeStateFieldOp(op) {
  return {
    ...op,
    target: op.target || 'world',
    type: op.type || 'text',
    update_mode: op.update_mode || 'manual',
    trigger_mode: op.trigger_mode || 'manual_only',
    allow_empty: Number(op.allow_empty) === 0 ? 0 : 1,
    enum_options: Array.isArray(op.enum_options) ? op.enum_options : null,
  };
}

function buildFieldOptions(fetchedFields, localStateFieldOps) {
  const items = [];
  const pushField = (scopeLabel, field) => {
    if (!field?.label) return;
    items.push({
      value: `${scopeLabel}.${field.label}`,
      label: `${scopeLabel}.${field.label}`,
      type: field.type || 'text',
    });
  };

  fetchedFields.world.forEach((field) => pushField('世界', field));
  fetchedFields.persona.forEach((field) => pushField('玩家', field));
  fetchedFields.character.forEach((field) => pushField('角色', field));

  for (const op of localStateFieldOps) {
    if (op.op === 'delete' || !op.label) continue;
    if (op.target === 'world') pushField('世界', op);
    if (op.target === 'persona') pushField('玩家', op);
    if (op.target === 'character') pushField('角色', op);
  }

  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = `${item.value}::${item.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

function getConditionOperatorOptions(targetField, fieldOptions) {
  const matched = fieldOptions.find((option) => option.value === targetField);
  return matched?.type === 'number' ? NUMERIC_CONDITION_OPTIONS : TEXT_CONDITION_OPTIONS;
}

function previewValue(value) {
  if (value == null || value === '') return '空';
  if (Array.isArray(value)) return value.join('，');
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

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
          rows={Math.min(12, Math.max(3, String(value || '').split('\n').length + 1))}
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

function ConditionEditor({ condition, fieldOptions, onChange, onRemove }) {
  const operatorOptions = getConditionOperatorOptions(condition.target_field, fieldOptions);
  const nextOperator = operatorOptions.some((item) => item.value === condition.operator)
    ? condition.operator
    : operatorOptions[0]?.value || '等于';

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.8fr) 90px minmax(0,1fr) 28px', gap: '6px', marginBottom: '6px' }}>
      <select
        value={condition.target_field}
        onChange={(e) => onChange({
          ...condition,
          target_field: e.target.value,
          operator: getConditionOperatorOptions(e.target.value, fieldOptions)[0]?.value || '等于',
        })}
        style={inputBase}
      >
        <option value="">选择字段</option>
        {fieldOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <select
        value={nextOperator}
        onChange={(e) => onChange({ ...condition, operator: e.target.value })}
        style={inputBase}
      >
        {operatorOptions.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      <input
        value={condition.value ?? ''}
        onChange={(e) => onChange({ ...condition, value: e.target.value })}
        placeholder="比较值"
        style={inputBase}
      />
      <button
        onClick={onRemove}
        style={{ ...inputBase, padding: '0', cursor: 'pointer', lineHeight: '26px' }}
        title="删除条件"
      >
        ×
      </button>
    </div>
  );
}

function WorldCardEntryOpEditor({ op, fieldOptions, onChange, onRemove }) {
  const opColor = op.op === 'delete' ? '#c0392b' : op.op === 'update' ? '#7a5c1e' : '#2e7a4a';
  const opLabel = op.op === 'delete' ? '删除' : op.op === 'update' ? '修改' : '新增';
  const triggerType = op.trigger_type || 'always';

  function updateCondition(index, patch) {
    onChange({
      ...op,
      conditions: (op.conditions || []).map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  }

  return (
    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', color: opColor, fontWeight: 700 }}>[{opLabel}] {ENTRY_TRIGGER_LABELS[triggerType] || triggerType}</span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--we-ink-muted)', padding: '0 2px', lineHeight: 1 }}
          title="移除此条目"
        >
          ×
        </button>
      </div>

      {op.op === 'delete' ? (
        <div style={{ fontSize: '12px', color: 'var(--we-ink-muted)' }}>删除 ID: {op.id}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 100px 78px', gap: '6px', marginBottom: '6px' }}>
            <input
              placeholder="标题"
              value={op.title || ''}
              onChange={(e) => onChange({ ...op, title: e.target.value })}
              style={inputBase}
            />
            <select
              value={triggerType}
              onChange={(e) => onChange(normalizeEntryOp({ ...op, trigger_type: e.target.value }))}
              style={inputBase}
            >
              {ENTRY_TRIGGER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              step={1}
              value={op.token ?? 1}
              onChange={(e) => onChange({ ...op, token: Math.max(1, parseInt(e.target.value, 10) || 1) })}
              style={inputBase}
            />
          </div>

          <textarea
            placeholder="条目内容"
            value={op.content || ''}
            onChange={(e) => onChange({ ...op, content: e.target.value })}
            rows={4}
            style={{ ...inputBase, resize: 'vertical', marginBottom: '6px' }}
          />

          {triggerType === 'keyword' && (
            <>
              <input
                placeholder="关键词，逗号分隔"
                value={Array.isArray(op.keywords) ? op.keywords.join(', ') : ''}
                onChange={(e) => onChange({ ...op, keywords: parseCommaSeparated(e.target.value) })}
                style={{ ...inputBase, marginBottom: '6px' }}
              />
              <select
                value={op.keyword_scope || 'user,assistant'}
                onChange={(e) => onChange({ ...op, keyword_scope: e.target.value })}
                style={{ ...inputBase, marginBottom: '6px' }}
              >
                {KEYWORD_SCOPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </>
          )}

          {(triggerType === 'llm' || triggerType === 'state') && (
            <textarea
              placeholder="触发条件描述（何时触发）"
              value={op.description || ''}
              onChange={(e) => onChange({ ...op, description: e.target.value })}
              rows={2}
              style={{ ...inputBase, resize: 'vertical', marginBottom: '6px' }}
            />
          )}

          {triggerType === 'state' && (
            <div>
              <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '4px' }}>状态条件</div>
              {(op.conditions || []).map((condition, index) => (
                <ConditionEditor
                  key={`${op.id || op.title || 'cond'}-${index}`}
                  condition={condition}
                  fieldOptions={fieldOptions}
                  onChange={(next) => updateCondition(index, next)}
                  onRemove={() => onChange({ ...op, conditions: (op.conditions || []).filter((_, i) => i !== index) })}
                />
              ))}
              <button
                onClick={() => onChange({
                  ...op,
                  conditions: [...(op.conditions || []), {
                    target_field: fieldOptions[0]?.value || '',
                    operator: getConditionOperatorOptions(fieldOptions[0]?.value || '', fieldOptions)[0]?.value || '等于',
                    value: '',
                  }],
                })}
                style={{ ...inputBase, width: 'auto', cursor: 'pointer' }}
              >
                + 添加条件
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StateFieldOpEditor({ op, onChange, onRemove }) {
  const isDelete = op.op === 'delete';
  const opColor = isDelete ? '#c0392b' : op.op === 'update' ? '#7a5c1e' : '#2e5a8a';
  const opLabel = isDelete ? '删除' : op.op === 'update' ? '修改' : '新增';

  return (
    <div style={{ marginBottom: '8px', padding: '8px', background: 'rgba(0,0,0,0.04)', borderRadius: '4px', border: '1px solid rgba(0,0,0,0.06)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <span style={{ fontSize: '10px', color: opColor, fontWeight: 700 }}>[{opLabel}] {op.label || op.field_key || op.id}</span>
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'var(--we-ink-muted)', padding: '0 2px', lineHeight: 1 }}
          title="移除此字段"
        >
          ×
        </button>
      </div>

      {isDelete ? (
        <div style={{ fontSize: '12px', color: 'var(--we-ink-muted)' }}>删除 ID: {op.id}</div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '90px minmax(0,1fr) 110px', gap: '6px', marginBottom: '6px' }}>
            <select
              value={op.target || 'world'}
              onChange={(e) => onChange({ ...op, target: e.target.value })}
              style={inputBase}
            >
              {STATE_FIELD_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <input
              placeholder="field_key"
              value={op.field_key || ''}
              disabled={op.op === 'update'}
              onChange={(e) => onChange({ ...op, field_key: e.target.value.replace(/\s/g, '_') })}
              style={inputBase}
            />
            <select
              value={op.type || 'text'}
              onChange={(e) => onChange(normalizeStateFieldOp({ ...op, type: e.target.value }))}
              style={inputBase}
            >
              {STATE_FIELD_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <input
            placeholder="显示名称"
            value={op.label || ''}
            onChange={(e) => onChange({ ...op, label: e.target.value })}
            style={{ ...inputBase, marginBottom: '6px' }}
          />

          <textarea
            placeholder="字段描述"
            value={op.description || ''}
            onChange={(e) => onChange({ ...op, description: e.target.value })}
            rows={2}
            style={{ ...inputBase, resize: 'vertical', marginBottom: '6px' }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 110px 110px', gap: '6px', marginBottom: '6px' }}>
            <input
              placeholder="默认值（JSON 字符串）"
              value={op.default_value ?? ''}
              onChange={(e) => onChange({ ...op, default_value: e.target.value })}
              style={inputBase}
            />
            <select
              value={op.update_mode || 'manual'}
              onChange={(e) => onChange({ ...op, update_mode: e.target.value })}
              style={inputBase}
            >
              {UPDATE_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={op.trigger_mode || 'manual_only'}
              onChange={(e) => onChange({ ...op, trigger_mode: e.target.value })}
              style={inputBase}
            >
              {TRIGGER_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          <textarea
            placeholder="更新指令"
            value={op.update_instruction || ''}
            onChange={(e) => onChange({ ...op, update_instruction: e.target.value })}
            rows={2}
            style={{ ...inputBase, resize: 'vertical', marginBottom: '6px' }}
          />

          {op.type === 'enum' && (
            <input
              placeholder="枚举选项，逗号分隔"
              value={Array.isArray(op.enum_options) ? op.enum_options.join(', ') : ''}
              onChange={(e) => onChange({ ...op, enum_options: parseCommaSeparated(e.target.value) })}
              style={{ ...inputBase, marginBottom: '6px' }}
            />
          )}

          {op.type === 'number' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
              <input
                type="number"
                placeholder="最小值"
                value={op.min_value ?? ''}
                onChange={(e) => onChange({ ...op, min_value: e.target.value === '' ? null : Number(e.target.value) })}
                style={inputBase}
              />
              <input
                type="number"
                placeholder="最大值"
                value={op.max_value ?? ''}
                onChange={(e) => onChange({ ...op, max_value: e.target.value === '' ? null : Number(e.target.value) })}
                style={inputBase}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EntryOpSummary({ op }) {
  const triggerLabel = ENTRY_TRIGGER_LABELS[op.trigger_type || 'always'] || op.trigger_type || 'always';
  return (
    <div style={{ fontSize: '12px', color: 'var(--we-ink-primary)', background: 'rgba(0,0,0,0.03)', padding: '6px 8px', borderRadius: '3px', marginBottom: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
        <strong>{op.title || op.id}</strong>
        <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)' }}>{OP_LABELS[op.op] || op.op}</span>
        {op.op !== 'delete' && <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)' }}>{triggerLabel}</span>}
        {op.op !== 'delete' && <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)' }}>token {op.token ?? 1}</span>}
      </div>
      {op.description && <div>触发：{op.description}</div>}
      {Array.isArray(op.keywords) && op.keywords.length > 0 && <div>关键词：{op.keywords.join('，')}</div>}
      {op.keyword_scope && op.trigger_type === 'keyword' && <div>匹配范围：{op.keyword_scope}</div>}
      {Array.isArray(op.conditions) && op.conditions.length > 0 && (
        <div>条件：{op.conditions.map((cond) => `${cond.target_field} ${cond.operator} ${cond.value}`).join('；')}</div>
      )}
      {op.content && <div style={{ marginTop: '4px' }}>{op.content}</div>}
    </div>
  );
}

function StateFieldOpSummary({ op }) {
  return (
    <div style={{ fontSize: '12px', color: 'var(--we-ink-primary)', background: 'rgba(0,0,0,0.03)', padding: '6px 8px', borderRadius: '3px', marginBottom: '4px', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' }}>
        <strong>{op.label || op.field_key || op.id}</strong>
        <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)' }}>{OP_LABELS[op.op] || op.op}</span>
        {op.target && <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)' }}>{STATE_FIELD_TARGET_OPTIONS.find((item) => item.value === op.target)?.label || op.target}</span>}
        {op.type && <span style={{ fontSize: '10px', color: 'var(--we-ink-muted)' }}>{STATE_TYPE_LABELS[op.type] || op.type}</span>}
      </div>
      {op.field_key && <div>field_key：{op.field_key}</div>}
      {op.description && <div>描述：{op.description}</div>}
      {op.default_value != null && <div>默认值：{previewValue(op.default_value)}</div>}
      {op.update_mode && <div>更新方式：{UPDATE_MODE_LABELS[op.update_mode] || op.update_mode}</div>}
      {op.trigger_mode && <div>触发方式：{TRIGGER_MODE_LABELS[op.trigger_mode] || op.trigger_mode}</div>}
      {Array.isArray(op.enum_options) && op.enum_options.length > 0 && <div>枚举：{op.enum_options.join('，')}</div>}
      {(op.min_value != null || op.max_value != null) && <div>范围：{op.min_value ?? '-'} ~ {op.max_value ?? '-'}</div>}
      {op.update_instruction && <div>更新指令：{op.update_instruction}</div>}
    </div>
  );
}

export default function ChangeProposalCard({ messageId, taskId, token, proposal, applied }) {
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [localChanges, setLocalChanges] = useState({});
  const [localEntryOps, setLocalEntryOps] = useState([]);
  const [localStateFieldOps, setLocalStateFieldOps] = useState([]);
  const [fieldCatalog, setFieldCatalog] = useState({ world: [], persona: [], character: [] });

  const markApplied = useAssistantStore((s) => s.markProposalApplied);
  const setResolvedId = useAssistantStore((s) => s.setResolvedId);
  const resolvedIds = useAssistantStore((s) => s.resolvedIds);
  const currentWorldId = useStore((s) => s.currentWorldId);

  if (!proposal) return null;

  const typeLabel = TYPE_LABELS[proposal.type] || proposal.type;
  const icon = TYPE_ICONS[proposal.type] || '📝';
  const operation = proposal.operation || 'update';
  const opLabel = OP_LABELS[operation] || operation;
  const isWorldCard = proposal.type === 'world-card';
  const worldRef = proposal.worldRef;
  const worldRefId = worldRef
    ? resolvedIds[worldRef]
    : (operation === 'create' && proposal.type === 'character-card'
        ? (proposal.entityId || currentWorldId)
        : null);
  const waitingForWorld = operation === 'create' && proposal.type === 'character-card' && worldRef && !worldRefId;
  const baseEntryOps = (() => {
    if (Array.isArray(proposal.entryOps) && proposal.entryOps.length > 0) return proposal.entryOps.map(normalizeEntryOp);
    if (Array.isArray(proposal.newEntries) && proposal.newEntries.length > 0) {
      return proposal.newEntries.map((entry) => normalizeEntryOp({ op: 'create', ...entry }));
    }
    return [];
  })();
  const baseStateFieldOps = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps.map(normalizeStateFieldOp) : [];
  const effectiveChanges = editing ? localChanges : (proposal.changes || {});
  const effectiveEntryOps = editing ? localEntryOps : baseEntryOps;
  const effectiveStateFieldOps = editing ? localStateFieldOps : baseStateFieldOps;
  const changesEntries = Object.entries(effectiveChanges).filter(([, value]) => value !== null && value !== undefined);
  const hasEntryOps = effectiveEntryOps.length > 0;
  const sourceWorldId = isWorldCard && operation !== 'create' ? (proposal.entityId || currentWorldId) : null;
  const fieldOptions = buildFieldOptions(fieldCatalog, effectiveStateFieldOps);

  useEffect(() => {
    if (!editing || !isWorldCard || !sourceWorldId) return;
    let cancelled = false;
    Promise.all([
      listWorldStateFields(sourceWorldId),
      listPersonaStateFields(sourceWorldId),
      listCharacterStateFields(sourceWorldId),
    ]).then(([world, persona, character]) => {
      if (cancelled) return;
      setFieldCatalog({ world, persona, character });
    }).catch(() => {
      if (cancelled) return;
      setFieldCatalog({ world: [], persona: [], character: [] });
    });
    return () => { cancelled = true; };
  }, [editing, isWorldCard, sourceWorldId]);

  function startEditing() {
    setLocalChanges(deepClone(proposal.changes || {}));
    setLocalEntryOps(deepClone(baseEntryOps));
    setLocalStateFieldOps(deepClone(baseStateFieldOps));
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
      const REFRESH_EVENT = {
        'world-card': 'we:world-updated',
        'character-card': 'we:character-updated',
        'persona-card': 'we:persona-updated',
        'global-config': 'we:global-config-updated',
      };
      const evtName = REFRESH_EVENT[proposal.type];
      if (evtName) window.dispatchEvent(new CustomEvent(evtName));
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
        <span style={{ fontFamily: 'var(--we-font-display)', fontStyle: 'italic', color: 'var(--we-ink-primary)', fontWeight: 500 }}>
          {typeLabel}{opLabel}预览
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
          {applied && (
            <span style={{ fontSize: '11px', color: '#5a8a5a', background: 'rgba(90,138,90,0.12)', padding: '1px 6px', borderRadius: '3px' }}>
              已应用
            </span>
          )}
          {editing && (
            <span style={{ fontSize: '11px', color: 'var(--we-vermilion, #8a5e4a)', background: 'rgba(138,94,74,0.1)', padding: '1px 6px', borderRadius: '3px' }}>
              编辑中
            </span>
          )}
        </div>
      </div>

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

      {operation !== 'delete' && changesEntries.length > 0 && (
        <div style={{ padding: '6px 12px', borderBottom: hasEntryOps || effectiveStateFieldOps.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
          {editing
            ? Object.keys(localChanges).map((key) => (
                <ChangeField
                  key={key}
                  fieldKey={key}
                  value={localChanges[key]}
                  onChange={(value) => setLocalChanges((prev) => ({ ...prev, [key]: value }))}
                />
              ))
            : changesEntries.map(([key, value]) => (
                <div key={key} style={{ marginBottom: '6px' }}>
                  <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '2px', fontFamily: 'monospace' }}>
                    {key}
                  </div>
                  <div style={{ color: 'var(--we-ink-primary)', fontSize: '12px', lineHeight: '1.5', background: 'rgba(0,0,0,0.03)', padding: '4px 8px', borderRadius: '3px', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {previewValue(value)}
                  </div>
                </div>
              ))}
        </div>
      )}

      {operation !== 'delete' && hasEntryOps && (
        <div style={{ padding: '6px 12px', borderBottom: effectiveStateFieldOps.length > 0 ? '1px solid rgba(0,0,0,0.06)' : 'none' }}>
          <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '4px' }}>
            Prompt 条目变更（{effectiveEntryOps.length} 项）
          </div>
          {editing && isWorldCard
            ? localEntryOps.map((op, index) => (
                <WorldCardEntryOpEditor
                  key={index}
                  op={op}
                  fieldOptions={fieldOptions}
                  onChange={(updated) => setLocalEntryOps((prev) => prev.map((item, i) => (i === index ? normalizeEntryOp(updated) : item)))}
                  onRemove={() => setLocalEntryOps((prev) => prev.filter((_, i) => i !== index))}
                />
              ))
            : editing
              ? localEntryOps.map((op, index) => (
                  <WorldCardEntryOpEditor
                    key={index}
                    op={op}
                    fieldOptions={[]}
                    onChange={(updated) => setLocalEntryOps((prev) => prev.map((item, i) => (i === index ? normalizeEntryOp(updated) : item)))}
                    onRemove={() => setLocalEntryOps((prev) => prev.filter((_, i) => i !== index))}
                  />
                ))
              : effectiveEntryOps.map((op, index) => <EntryOpSummary key={index} op={op} />)}
        </div>
      )}

      {operation !== 'delete' && effectiveStateFieldOps.length > 0 && (
        <div style={{ padding: '6px 12px' }}>
          <div style={{ fontSize: '11px', color: 'var(--we-ink-muted, #9c8a7e)', marginBottom: '4px' }}>
            状态字段变更（{effectiveStateFieldOps.length} 项）
          </div>
          {editing
            ? localStateFieldOps.map((op, index) => (
                <StateFieldOpEditor
                  key={index}
                  op={op}
                  onChange={(updated) => setLocalStateFieldOps((prev) => prev.map((item, i) => (i === index ? normalizeStateFieldOp(updated) : item)))}
                  onRemove={() => setLocalStateFieldOps((prev) => prev.filter((_, i) => i !== index))}
                />
              ))
            : effectiveStateFieldOps.map((op, index) => <StateFieldOpSummary key={index} op={op} />)}
        </div>
      )}

      {!applied && (
        <div style={{ padding: '8px 12px', display: 'flex', gap: '8px', alignItems: 'center', borderTop: '1px solid rgba(0,0,0,0.06)', flexWrap: 'wrap' }}>
          {canEdit && !editing && (
            <button
              onClick={startEditing}
              style={{ padding: '4px 12px', fontSize: '12px', fontFamily: 'var(--we-font-display)', fontStyle: 'italic', background: 'rgba(0,0,0,0.07)', color: 'var(--we-ink-secondary, #6b5a4e)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '3px', cursor: 'pointer' }}
            >
              编辑
            </button>
          )}
          {editing && (
            <button
              onClick={cancelEditing}
              style={{ padding: '4px 12px', fontSize: '12px', fontFamily: 'var(--we-font-display)', fontStyle: 'italic', background: 'rgba(0,0,0,0.07)', color: 'var(--we-ink-secondary, #6b5a4e)', border: '1px solid rgba(0,0,0,0.12)', borderRadius: '3px', cursor: 'pointer' }}
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
              background: waitingForWorld ? 'rgba(0,0,0,0.15)' : applying ? 'rgba(138,94,74,0.4)' : operation === 'delete' ? '#c0392b' : 'var(--we-vermilion, #8a5e4a)',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: applying || waitingForWorld ? 'default' : 'pointer',
              transition: 'opacity 0.15s',
            }}
          >
            {applying ? '执行中...' : waitingForWorld ? '等待世界卡' : operation === 'create' ? '创建' : operation === 'delete' ? '确认删除' : '应用'}
          </button>
          {error && <span style={{ fontSize: '11px', color: '#c0392b' }}>{error}</span>}
        </div>
      )}
    </div>
  );
}
