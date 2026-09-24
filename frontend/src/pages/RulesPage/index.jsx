import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import StateFieldEditor from '../../components/state/StateFieldEditor';
import StateValueField from '../../components/state/StateValueField';
import EntryEditor from '../../components/state/EntryEditor';
import DragHandle from '../../components/ui/DragHandle.jsx';
import Icon from '../../components/ui/Icon.jsx';
import SortableList from '../../components/ui/SortableList.jsx';
import ConfirmModal from '../../components/ui/ConfirmModal.jsx';
import {
  listWorldStateFields, createWorldStateField, updateWorldStateField, deleteWorldStateField,
} from '../../core/api/world-state-fields';
import {
  listCharacterStateFields, createCharacterStateField, updateCharacterStateField, deleteCharacterStateField,
} from '../../core/api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField, updatePersonaStateField, deletePersonaStateField,
} from '../../core/api/persona-state-fields';
import { getWorldStateValues, updateWorldStateValue } from '../../core/api/world-state-values';
import { getCharacterStateValues, updateCharacterStateValue } from '../../core/api/character-state-values';
import { getPersonaStateValuesByPersonaId, updatePersonaStateValueByPersonaId } from '../../core/api/persona-state-values';
import { getCharactersByWorld } from '../../core/api/characters';
import { listPersonas } from '../../core/api/personas';
import {
  listWorldEntries, getEntryConditions, deleteWorldEntry, reorderWorldEntries, updateWorldEntry,
} from '../../core/api/prompt-entries';
import { log } from '../../core/utils/logger.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';

// 三种作用域的配置：字段模板 CRUD + 实例列表 + 实例默认值读写。
// cnScope 是状态条件 target_field 里用的中文作用域名（'世界.字段名'）。
const SCOPES = {
  world: {
    key: 'world', label: '世界', cnScope: '世界',
    listFn: listWorldStateFields, createFn: createWorldStateField,
    updateFn: updateWorldStateField, deleteFn: deleteWorldStateField,
    // 世界作用域只有一个实例：世界本身
    getInstances: async (worldId) => [{ id: worldId, name: '本世界' }],
    getValues: (worldId) => getWorldStateValues(worldId),
    updateValue: (worldId, _instId, fk, vj) => updateWorldStateValue(worldId, fk, vj),
  },
  character: {
    key: 'character', label: '角色', cnScope: '角色',
    listFn: listCharacterStateFields, createFn: createCharacterStateField,
    updateFn: updateCharacterStateField, deleteFn: deleteCharacterStateField,
    getInstances: (worldId) => getCharactersByWorld(worldId),
    getValues: (_worldId, charId) => getCharacterStateValues(charId),
    updateValue: (_worldId, charId, fk, vj) => updateCharacterStateValue(charId, fk, vj),
  },
  persona: {
    key: 'persona', label: '玩家', cnScope: '玩家',
    listFn: listPersonaStateFields, createFn: createPersonaStateField,
    updateFn: updatePersonaStateField, deleteFn: deletePersonaStateField,
    getInstances: (worldId) => listPersonas(worldId),
    getValues: (worldId, personaId) => getPersonaStateValuesByPersonaId(worldId, personaId),
    updateValue: (worldId, personaId, fk, vj) => updatePersonaStateValueByPersonaId(worldId, personaId, fk, vj),
  },
};
const FIELD_SCOPE_KEYS = ['world', 'character', 'persona'];
const TYPE_LABEL = { text: '文本', number: '数值', boolean: '布尔', enum: '枚举', list: '列表', datetime: '时间', table: '表格' };

// 触发机制：条目的一个属性（何时生效），不再是左栏分类维度——
// 左栏改按用户自己起的分组名导航，机制只在中栏色点 + 筛选 chip、右栏详情里出现。
const TRIGGER_TYPES = [
  { key: 'always', label: '一直生效', desc: '始终注入' },
  { key: 'keyword', label: '出现关键词', desc: '对话中出现指定词语时自动注入' },
  { key: 'llm', label: 'AI 判断相关', desc: '由 AI 判断当前情境是否需要注入' },
  { key: 'state', label: '状态满足条件', desc: '当状态字段满足设定条件时自动注入' },
];
const TRIGGER_LABEL = Object.fromEntries(TRIGGER_TYPES.map((t) => [t.key, t.label]));
const UNGROUPED = '__ungrouped__';

export default function RulesPage() {
  const { worldId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── 设定条目 ──
  const [entries, setEntries] = useState([]);
  const [entryFilter, setEntryFilter] = useState('all'); // all | 分组名 | UNGROUPED（左栏导航）
  const [triggerTypeFilter, setTriggerTypeFilter] = useState('all'); // all | always | keyword | llm | state（中栏筛选 chip）
  const [orderMode, setOrderMode] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [creatingEntry, setCreatingEntry] = useState(false);
  const [confirmingDeleteEntry, setConfirmingDeleteEntry] = useState(null);

  // ── 状态字段 ──
  const [fieldsByScope, setFieldsByScope] = useState({ world: [], character: [], persona: [] });
  const [fieldScopeKey, setFieldScopeKey] = useState('character');
  const [selectedFieldKey, setSelectedFieldKey] = useState(null);
  const [creatingField, setCreatingField] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // 顶层导航：'entries'（设定条目）| 'fields'（状态字段）。旧的 /state-workshop
  // 路由重定向到 ?tab=state，落在这里默认打开状态字段视图。
  const [navMode, setNavMode] = useState(searchParams.get('tab') === 'state' ? 'fields' : 'entries');

  const fieldScope = SCOPES[fieldScopeKey];
  const fields = fieldsByScope[fieldScopeKey];
  const selectedField = useMemo(
    () => fields.find((f) => f.field_key === selectedFieldKey) ?? null,
    [fields, selectedFieldKey],
  );
  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedEntryId) ?? null,
    [entries, selectedEntryId],
  );

  const refreshEntries = useCallback(() => {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
  }, [worldId]);

  useEffect(() => { refreshEntries(); }, [refreshEntries]);
  useEffect(() => {
    window.addEventListener('we:world-updated', refreshEntries);
    return () => window.removeEventListener('we:world-updated', refreshEntries);
  }, [refreshEntries]);

  // 挂载时把三个作用域的字段都拉一遍，让左栏「状态字段」分组下三行计数随时可见，
  // 不必等用户先点进某个作用域才知道有多少字段。
  const loadFieldsFor = useCallback(async (scopeKey) => {
    try {
      const list = await SCOPES[scopeKey].listFn(worldId);
      setFieldsByScope((prev) => ({ ...prev, [scopeKey]: list }));
      return list;
    } catch (err) {
      log.error('rules.fields.load_failed', err, { toast: err.message || '加载字段失败' });
      return [];
    }
  }, [worldId]);

  useEffect(() => {
    FIELD_SCOPE_KEYS.forEach((k) => { loadFieldsFor(k); });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 仅需在 worldId 变化时重拉
  }, [worldId]);

  // 左栏分组：用户自己在条目详情里填的 group_name，未分组的落在 UNGROUPED。
  // 不按 trigger_type 派生——机制不再是分类维度。
  const groupList = useMemo(() => {
    const counts = new Map();
    for (const e of entries) {
      const key = e.group_name ? e.group_name : UNGROUPED;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const named = [...counts.entries()]
      .filter(([key]) => key !== UNGROUPED)
      .sort((a, b) => a[0].localeCompare(b[0], 'zh'));
    return { named, ungroupedCount: counts.get(UNGROUPED) ?? 0 };
  }, [entries]);
  // 详情里「分组」输入框的建议列表：用户已经起过的分组名
  const existingGroupNames = useMemo(() => groupList.named.map(([name]) => name), [groupList]);

  function selectEntryGroup(key) {
    setNavMode('entries');
    setEntryFilter(key);
    setOrderMode(false);
    setSelectedEntryId(null);
    setCreatingEntry(false);
  }

  function selectFieldScope(key) {
    setNavMode('fields');
    setFieldScopeKey(key);
    setSelectedFieldKey(fieldsByScope[key]?.[0]?.field_key ?? null);
    setCreatingField(false);
  }

  async function handleDeleteEntry() {
    try {
      await deleteWorldEntry(confirmingDeleteEntry.id);
      if (selectedEntryId === confirmingDeleteEntry.id) setSelectedEntryId(null);
      setConfirmingDeleteEntry(null);
      refreshEntries();
    } catch (e) {
      log.error('entry.delete_failed', e, { toast: '删除失败：' + (e?.message || '未知错误') });
    }
  }

  async function handleToggleEntry(entry) {
    const newEnabled = entry.enabled === 0 ? 1 : 0;
    setEntries((prev) => prev.map((e) => (e.id === entry.id ? { ...e, enabled: newEnabled } : e)));
    try {
      await updateWorldEntry(entry.id, { enabled: newEnabled });
    } catch (e) {
      setEntries((prev) => prev.map((ee) => (ee.id === entry.id ? { ...ee, enabled: entry.enabled } : ee)));
      log.error('entry.toggle_failed', e, { toast: '切换失败：' + (e?.message || '未知错误') });
    }
  }

  async function handleReorderEntriesEnd(finalItems) {
    try {
      await reorderWorldEntries(worldId, finalItems.map((e) => e.id));
    } catch (e) {
      log.error('entry.reorder_failed', e, { toast: '排序保存失败：' + (e?.message || '未知错误') });
      refreshEntries();
    }
  }

  const groupFilteredEntries = entryFilter === 'all'
    ? entries
    : entryFilter === UNGROUPED
      ? entries.filter((e) => !e.group_name)
      : entries.filter((e) => e.group_name === entryFilter);
  const filteredEntries = triggerTypeFilter === 'all'
    ? groupFilteredEntries
    : groupFilteredEntries.filter((e) => e.trigger_type === triggerTypeFilter);
  // 新建条目预填分组：当前选中了具体分组时带入，选"全部"/"未分组"时不预填
  const defaultGroupNameForNew = entryFilter !== 'all' && entryFilter !== UNGROUPED ? entryFilter : '';

  return (
    <div className="we-characters-canvas">
      <div className="we-workshop">
        <button className="we-workshop-back" onClick={() => navigate(`/worlds/${worldId}`)}>
          <Icon size={14}>
            <polyline points="15 18 9 12 15 6" />
          </Icon>
          返回世界
        </button>
        <header className="we-workshop-header">
          <h1 className="we-workshop-title">这个世界的规则</h1>
          <p className="we-workshop-subtitle">设定条目、状态字段、注入顺序都在这一处管理</p>
          <button className="we-btn we-btn-primary we-btn-sm" onClick={() => setWizardOpen(true)}>
            + 新建系统（向导）
          </button>
        </header>

        <div className="we-workshop-body we-workshop-body--3col">
          {/* 左：导航 */}
          <nav className="we-workshop-nav">
            <div className="we-workshop-nav-group">
              <div className="we-workshop-nav-group-title">设定条目</div>
              <button
                data-testid="nav-entries-all"
                className={`we-workshop-nav-item${navMode === 'entries' && entryFilter === 'all' ? ' is-active' : ''}`}
                onClick={() => selectEntryGroup('all')}
              >
                <span>全部</span>
                <span className="we-field-badge">{entries.length}</span>
              </button>
              {groupList.named.map(([name, count]) => (
                <button
                  key={name}
                  data-testid={`nav-entries-group-${name}`}
                  className={`we-workshop-nav-item${navMode === 'entries' && entryFilter === name ? ' is-active' : ''}`}
                  onClick={() => selectEntryGroup(name)}
                >
                  <span>{name}</span>
                  <span className="we-field-badge">{count}</span>
                </button>
              ))}
              <button
                data-testid="nav-entries-ungrouped"
                className={`we-workshop-nav-item${navMode === 'entries' && entryFilter === UNGROUPED ? ' is-active' : ''}`}
                onClick={() => selectEntryGroup(UNGROUPED)}
              >
                <span>未分组</span>
                <span className="we-field-badge">{groupList.ungroupedCount}</span>
              </button>
            </div>

            <div className="we-workshop-nav-group">
              <div className="we-workshop-nav-group-title">状态字段</div>
              {FIELD_SCOPE_KEYS.map((k) => (
                <button
                  key={k}
                  data-testid={`nav-fields-${k}`}
                  className={`we-workshop-nav-item${navMode === 'fields' && fieldScopeKey === k ? ' is-active' : ''}`}
                  onClick={() => selectFieldScope(k)}
                >
                  <span>{SCOPES[k].label}状态</span>
                  <span className="we-field-badge">{fieldsByScope[k].length}</span>
                </button>
              ))}
            </div>
          </nav>

          {/* 中：列表 */}
          {navMode === 'entries' ? (
            <section className="we-workshop-list">
              <div className="we-workshop-list-head">
                <span>
                  {entryFilter === 'all' ? '全部条目' : entryFilter === UNGROUPED ? '未分组条目' : `「${entryFilter}」条目`}
                </span>
                <div className="we-workshop-list-actions">
                  <button
                    className={`we-btn we-btn-sm${orderMode ? ' we-btn-primary' : ' we-btn-secondary'}`}
                    onClick={() => { setOrderMode((v) => !v); setSelectedEntryId(null); setCreatingEntry(false); }}
                  >
                    {orderMode ? '完成排序' : '调整顺序'}
                  </button>
                  {!orderMode && (
                    <button
                      className="we-btn we-btn-sm we-btn-secondary"
                      onClick={() => { setCreatingEntry(true); setSelectedEntryId(null); }}
                    >
                      + 新建
                    </button>
                  )}
                </div>
              </div>

              {!orderMode && (
                <div className="we-trigger-filter-row" role="group" aria-label="按触发机制筛选">
                  <button
                    type="button"
                    className={`we-trigger-filter-chip${triggerTypeFilter === 'all' ? ' is-active' : ''}`}
                    onClick={() => setTriggerTypeFilter('all')}
                  >
                    全部机制
                  </button>
                  {TRIGGER_TYPES.map((t) => (
                    <button
                      type="button"
                      key={t.key}
                      className={`we-trigger-filter-chip${triggerTypeFilter === t.key ? ' is-active' : ''}`}
                      onClick={() => setTriggerTypeFilter(t.key)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )}

              {orderMode ? (
                <EntryOrderList
                  entries={entries}
                  onReorder={setEntries}
                  onReorderEnd={handleReorderEntriesEnd}
                  onToggle={handleToggleEntry}
                />
              ) : (
                <EntryPlainList
                  entries={filteredEntries}
                  selectedId={selectedEntryId}
                  onSelect={(entry) => { setSelectedEntryId(entry.id); setCreatingEntry(false); }}
                  onToggle={handleToggleEntry}
                  onDelete={setConfirmingDeleteEntry}
                />
              )}
            </section>
          ) : (
            <section className="we-workshop-list">
              <div className="we-workshop-list-head">
                <span>{fieldScope.label}字段</span>
                <button className="we-btn we-btn-sm we-btn-secondary" onClick={() => setCreatingField(true)}>+ 添加</button>
              </div>
              {fields.length === 0 ? (
                <p className="we-workshop-empty">暂无字段</p>
              ) : (
                <ul className="we-workshop-field-items">
                  {fields.map((f) => (
                    <li key={f.field_key}>
                      <button
                        className={`we-workshop-field-item${f.field_key === selectedFieldKey ? ' is-active' : ''}`}
                        onClick={() => setSelectedFieldKey(f.field_key)}
                      >
                        <span className="we-workshop-field-name">{f.label}</span>
                        <span className="we-field-badge">{TYPE_LABEL[f.type] ?? f.type}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {/* 右：详情 */}
          <section className="we-workshop-detail">
            {navMode === 'entries' ? (
              orderMode ? (
                <p className="we-workshop-empty">拖拽左侧条目调整顺序，越靠上越先注入。完成后点「完成排序」返回列表。</p>
              ) : creatingEntry ? (
                <div className="we-workshop-detail-inner">
                  <EntryEditor
                    inline
                    worldId={worldId}
                    entry={null}
                    defaultGroupName={defaultGroupNameForNew}
                    existingGroupNames={existingGroupNames}
                    onClose={() => setCreatingEntry(false)}
                    onSave={() => { setCreatingEntry(false); refreshEntries(); }}
                  />
                </div>
              ) : selectedEntry ? (
                <div className="we-workshop-detail-inner">
                  <EntryEditor
                    key={selectedEntry.id}
                    inline
                    worldId={worldId}
                    entry={selectedEntry}
                    existingGroupNames={existingGroupNames}
                    onClose={() => setSelectedEntryId(null)}
                    onSave={() => refreshEntries()}
                  />
                </div>
              ) : (
                <RulesOverview
                  entries={entries}
                  fieldsByScope={fieldsByScope}
                  hint="选择左侧条目查看详情，或点「+ 新建」创建一条设定"
                />
              )
            ) : !selectedField ? (
              <RulesOverview
                entries={entries}
                fieldsByScope={fieldsByScope}
                hint="选择左侧字段查看详情，或点「新建系统」一步步搭建"
              />
            ) : (
              <FieldDetail
                key={`${fieldScopeKey}:${selectedField.field_key}`}
                worldId={worldId}
                scope={fieldScope}
                scopeKey={fieldScopeKey}
                field={selectedField}
                existingGroupNames={existingGroupNames}
                onDefinitionSaved={() => loadFieldsFor(fieldScopeKey)}
              />
            )}
          </section>
        </div>
      </div>

      {/* 新建字段定义 */}
      {creatingField && (
        <StateFieldEditor
          field={null}
          scope={fieldScopeKey}
          onSave={async (payload) => {
            const created = await fieldScope.createFn(worldId, payload);
            await loadFieldsFor(fieldScopeKey);
            setSelectedFieldKey(created?.field_key ?? payload.field_key);
          }}
          onClose={() => setCreatingField(false)}
        />
      )}

      {/* 新建系统向导 */}
      {wizardOpen && (
        <NewSystemWizard
          worldId={worldId}
          scope={fieldScope}
          scopeKey={fieldScopeKey}
          onClose={() => setWizardOpen(false)}
          onFinish={async (createdKey) => {
            setWizardOpen(false);
            await loadFieldsFor(fieldScopeKey);
            setNavMode('fields');
            if (createdKey) setSelectedFieldKey(createdKey);
          }}
        />
      )}

      {confirmingDeleteEntry && (
        <ConfirmModal
          title="删除条目"
          message={`确认删除条目「${confirmingDeleteEntry.title}」？此操作不可撤销。`}
          confirmText="删除"
          danger
          onConfirm={handleDeleteEntry}
          onClose={() => setConfirmingDeleteEntry(null)}
        />
      )}
    </div>
  );
}

// ── 右栏空态：不用一句灰字占满六成屏，改为整个世界规则的概览——
//    各类型条目数、启用/禁用数、状态字段数、注入顺序前几条 ──
function RulesOverview({ entries, fieldsByScope, hint }) {
  const enabledCount = entries.filter((e) => e.enabled !== 0).length;
  const disabledCount = entries.length - enabledCount;
  const fieldTotal = FIELD_SCOPE_KEYS.reduce((sum, k) => sum + fieldsByScope[k].length, 0);
  const orderPreview = [...entries]
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .slice(0, 5);

  return (
    <div className="we-workshop-detail-inner we-rules-overview">
      <div className="we-workshop-section">
        <span className="we-workshop-section-title">设定条目</span>
        <div className="we-rules-overview-stats">
          {TRIGGER_TYPES.map((t) => (
            <div key={t.key} className="we-rules-overview-stat">
              <span className="we-rules-overview-stat-value">{entries.filter((e) => e.trigger_type === t.key).length}</span>
              <span className="we-rules-overview-stat-label">{t.label}</span>
            </div>
          ))}
          <div className="we-rules-overview-stat">
            <span className="we-rules-overview-stat-value">{enabledCount}</span>
            <span className="we-rules-overview-stat-label">已启用</span>
          </div>
          <div className="we-rules-overview-stat">
            <span className="we-rules-overview-stat-value">{disabledCount}</span>
            <span className="we-rules-overview-stat-label">已禁用</span>
          </div>
        </div>
      </div>

      <div className="we-workshop-section">
        <span className="we-workshop-section-title">状态字段</span>
        <div className="we-rules-overview-stats">
          {FIELD_SCOPE_KEYS.map((k) => (
            <div key={k} className="we-rules-overview-stat">
              <span className="we-rules-overview-stat-value">{fieldsByScope[k].length}</span>
              <span className="we-rules-overview-stat-label">{SCOPES[k].label}</span>
            </div>
          ))}
          <div className="we-rules-overview-stat">
            <span className="we-rules-overview-stat-value">{fieldTotal}</span>
            <span className="we-rules-overview-stat-label">合计</span>
          </div>
        </div>
      </div>

      {orderPreview.length > 0 && (
        <div className="we-workshop-section">
          <span className="we-workshop-section-title">注入顺序（前 {orderPreview.length} 条）</span>
          <ol className="we-rules-overview-order">
            {orderPreview.map((e) => (
              <li key={e.id} className={e.enabled === 0 ? 'is-disabled' : undefined}>
                <span className="we-entry-section-badge">{TRIGGER_LABEL[e.trigger_type]}</span>
                <span>{e.title || '（无标题）'}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      <p className="we-workshop-empty">{hint}</p>
    </div>
  );
}

// ── 设定条目：普通列表（按分组筛选，不可拖拽——sort_order 是跨类型的全局顺序，
//    筛选后的子集内拖拽会破坏真实顺序，拖拽排序统一放到「调整顺序」视图里做）──
function EntryPlainList({ entries, selectedId, onSelect, onToggle, onDelete }) {
  if (entries.length === 0) {
    return <div className="we-entry-section-empty">暂无条目</div>;
  }
  return (
    <div className="we-entry-section-list" data-testid="entry-list">
      {entries.map((entry) => (
        <div
          key={entry.id}
          role="button"
          tabIndex={0}
          className={`we-entry-section-row we-entry-section-row--selectable${entry.enabled === 0 ? ' we-entry-section-row--disabled' : ''}${entry.id === selectedId ? ' is-selected' : ''}`}
          onClick={() => onSelect(entry)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(entry); } }}
        >
          <div className="we-entry-section-main">
            <div className="we-entry-section-title-line">
              <span className="we-entry-section-name">{entry.title || '（无标题）'}</span>
              <span className="we-entry-section-badge">{TRIGGER_LABEL[entry.trigger_type]}</span>
              {entry.trigger_type === 'always' && entry.token === 0 && entry.enabled !== 0 && (
                <span className="we-entry-cached-badge" title="此条目进入 prompt 缓存前缀，稳定不变以提高缓存命中率">已缓存</span>
              )}
              {entry.trigger_type === 'keyword' && entry.active_turns === 0 && entry.enabled !== 0 && (
                <span className="we-entry-cached-badge" title="命中后永久生效">永久</span>
              )}
            </div>
            {entry.trigger_type === 'keyword' && entry.keywords?.length > 0 && (
              <span className="we-entry-section-keywords" title={entry.keywords.join(' / ')}>
                触发词：{entry.keywords.slice(0, 3).join(' / ')}{entry.keywords.length > 3 ? '…' : ''}
              </span>
            )}
          </div>
          <div className="we-entry-section-actions">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(entry); }}
              className={`we-entry-section-toggle${entry.enabled === 0 ? ' we-entry-section-toggle--off' : ''}`}
              aria-label={entry.enabled === 0 ? '启用条目' : '禁用条目'}
              title={entry.enabled === 0 ? '已禁用，点击启用' : '点击禁用'}
            >
              <span className="we-entry-section-toggle-thumb" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(entry); }}
              className="we-entry-section-action we-entry-section-action--danger"
            >
              删除
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── 设定条目：完整注入顺序视图（跨全部 trigger_type 一起拖拽，落库到 sort_order）──
function EntryOrderList({ entries, onReorder, onReorderEnd, onToggle }) {
  if (entries.length === 0) {
    return <div className="we-entry-section-empty">暂无条目</div>;
  }
  return (
    <SortableList
      items={entries}
      onReorder={onReorder}
      onReorderEnd={onReorderEnd}
      useHandle
      style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      renderItem={(entry, dragHandleProps) => (
        <div className={`we-entry-section-row${entry.enabled === 0 ? ' we-entry-section-row--disabled' : ''}`}>
          <span className="we-entry-section-drag" {...dragHandleProps}><DragHandle /></span>
          <div className="we-entry-section-main">
            <div className="we-entry-section-title-line">
              <span className="we-entry-section-name">{entry.title || '（无标题）'}</span>
              <span className="we-entry-section-badge">{TRIGGER_LABEL[entry.trigger_type]}</span>
            </div>
          </div>
          <div className="we-entry-section-actions">
            <button
              onClick={(e) => { e.stopPropagation(); onToggle(entry); }}
              className={`we-entry-section-toggle${entry.enabled === 0 ? ' we-entry-section-toggle--off' : ''}`}
              aria-label={entry.enabled === 0 ? '启用条目' : '禁用条目'}
              title={entry.enabled === 0 ? '已禁用，点击启用' : '点击禁用'}
            >
              <span className="we-entry-section-toggle-thumb" />
            </button>
          </div>
        </div>
      )}
    />
  );
}

// ── 字段详情：定义 + 默认值矩阵 + 相关条目 ──
function FieldDetail({ worldId, scope, scopeKey, field, existingGroupNames, onDefinitionSaved }) {
  const [entryEditor, setEntryEditor] = useState(null); // { entry } | { prefill:true }
  const [entriesReload, setEntriesReload] = useState(0);
  const [editingDef, setEditingDef] = useState(false); // 是否就地展开「编辑定义」

  return (
    <div className="we-workshop-detail-inner">
      <div className="we-workshop-detail-head">
        <div>
          <h2 className="we-workshop-detail-title">{field.label}</h2>
          <span className="we-field-badge">{TYPE_LABEL[field.type] ?? field.type}</span>
          {field.description && <p className="we-workshop-detail-desc">{field.description}</p>}
        </div>
        <button
          className="we-btn we-btn-sm we-btn-secondary"
          onClick={() => setEditingDef((v) => !v)}
        >
          {editingDef ? '收起定义' : '编辑定义'}
        </button>
      </div>

      {editingDef && (
        <div className="we-workshop-section">
          <StateFieldEditor
            inline
            field={field}
            scope={scopeKey}
            onSave={async (payload) => {
              await scope.updateFn(field.id, payload);
              setEditingDef(false);
              onDefinitionSaved();
            }}
            onClose={() => setEditingDef(false)}
          />
        </div>
      )}

      <DefaultValueMatrix worldId={worldId} scope={scope} field={field} />

      <RelatedEntries
        worldId={worldId}
        scope={scope}
        field={field}
        reloadKey={entriesReload}
        onNew={() => setEntryEditor({ prefill: true })}
        onEdit={(entry) => setEntryEditor({ entry })}
      />

      {entryEditor && (
        <div className="we-workshop-section">
          <EntryEditor
            inline
            worldId={worldId}
            entry={entryEditor.entry ?? null}
            defaultTriggerType="state"
            existingGroupNames={existingGroupNames}
            prefillCondition={entryEditor.prefill ? { scope: scope.cnScope, field_label: field.label } : undefined}
            onClose={() => setEntryEditor(null)}
            onSave={() => { setEntryEditor(null); setEntriesReload((k) => k + 1); }}
          />
        </div>
      )}
    </div>
  );
}

// ── 默认值矩阵：行=该作用域下各实例 ──
function DefaultValueMatrix({ worldId, scope, field }) {
  const [instances, setInstances] = useState([]);
  const [rowsByInstance, setRowsByInstance] = useState({}); // instId -> field row
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkDraftRef = useRef(null); // 批量草稿值（JSON 串），点「应用」前不写库

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const insts = await scope.getInstances(worldId);
        const valuesList = await Promise.all(insts.map((inst) => scope.getValues(worldId, inst.id)));
        if (cancelled) return;
        const map = {};
        insts.forEach((inst, i) => {
          const rows = Array.isArray(valuesList[i]) ? valuesList[i] : [];
          map[inst.id] = rows.find((r) => r.field_key === field.field_key) ?? null;
        });
        setInstances(insts);
        setRowsByInstance(map);
      } catch (err) {
        log.error('workshop.matrix.load_failed', err, { toast: err.message || '加载默认值失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scope, worldId, field.field_key, reload]);

  async function handleCellSave(instId, fieldKey, valueJson) {
    try {
      await scope.updateValue(worldId, instId, fieldKey, valueJson);
    } catch (err) {
      log.error('workshop.matrix.save_failed', err, { toast: err.message || '保存失败' });
    }
  }

  // 批量控件只把值记进草稿，不写库——避免自动保存控件每敲一下就 fan-out + remount 矩阵导致闪烁
  function handleBulkDraft(_fieldKey, valueJson) {
    bulkDraftRef.current = valueJson;
  }

  // 点「应用到全部」才真正写入所有实例，并一次性重拉使各格 remount 显示新值
  async function handleBulkApply() {
    const valueJson = bulkDraftRef.current;
    if (valueJson == null) return;
    setBulkSaving(true);
    try {
      await Promise.all(instances.map((inst) => scope.updateValue(worldId, inst.id, field.field_key, valueJson)));
      setReload((k) => k + 1);
    } catch (err) {
      log.error('workshop.matrix.bulk_failed', err, { toast: err.message || '批量保存失败' });
    } finally {
      setBulkSaving(false);
    }
  }

  // 批量控件复用某实例的字段行，但清空值使其从空白开始
  const sampleRow = instances.map((i) => rowsByInstance[i.id]).find(Boolean);
  const bulkField = sampleRow
    ? { ...sampleRow, value_json: null, default_value_json: null, effective_value_json: null }
    : null;

  return (
    <div className="we-workshop-section">
      <div className="we-workshop-section-head">
        <span className="we-workshop-section-title">各{scope.label}默认值</span>
        {bulkField && instances.length > 1 && (
          <div className="we-workshop-bulk">
            <span className="we-workshop-bulk-label">批量填同值</span>
            <StateValueField
              key={`bulk:${field.field_key}`}
              field={bulkField}
              onSave={handleBulkDraft}
            />
            <button
              type="button"
              className="we-btn we-btn-sm we-btn-secondary"
              onClick={handleBulkApply}
              disabled={bulkSaving}
            >
              {bulkSaving ? '应用中…' : '应用到全部'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="we-workshop-empty">加载中…</p>
      ) : instances.length === 0 ? (
        <p className="we-workshop-empty">暂无{scope.label}</p>
      ) : (
        <div className="we-workshop-matrix">
          {instances.map((inst) => {
            const row = rowsByInstance[inst.id];
            return (
              <div key={inst.id} className="we-workshop-matrix-row">
                <span className="we-workshop-matrix-name">{inst.name || '未命名'}</span>
                <div className="we-workshop-matrix-value">
                  {row ? (
                    <StateValueField
                      field={row}
                      onSave={(fk, vj) => handleCellSave(inst.id, fk, vj)}
                    />
                  ) : (
                    <span className="we-workshop-empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── 相关条目：引用本字段的状态条件条目，跨字段打标记 ──
function RelatedEntries({ worldId, scope, field, reloadKey, onNew, onEdit }) {
  const [items, setItems] = useState([]); // { entry, otherFields:string[] }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const entries = await listWorldEntries(worldId);
        const stateEntries = entries.filter((e) => e.trigger_type === 'state');
        const withConds = await Promise.all(stateEntries.map(async (e) => ({
          entry: e,
          conditions: await getEntryConditions(e.id),
        })));
        if (cancelled) return;
        const matchTarget = `${scope.cnScope}.${field.label}`;
        const result = [];
        for (const { entry, conditions } of withConds) {
          const refsThis = conditions.some((c) => fieldOfCondition(c.target_field) === matchTarget);
          if (!refsThis) continue;
          const others = [...new Set(
            conditions
              .map((c) => fieldOfCondition(c.target_field))
              .filter((t) => t && t !== matchTarget),
          )];
          result.push({ entry, otherFields: others });
        }
        setItems(result);
      } catch (err) {
        log.error('workshop.entries.load_failed', err, { toast: err.message || '加载相关条目失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [worldId, scope.cnScope, field.label, reloadKey]);

  return (
    <div className="we-workshop-section">
      <div className="we-workshop-section-head">
        <span className="we-workshop-section-title">相关触发条目</span>
        <button className="we-btn we-btn-sm we-btn-secondary" onClick={onNew}>+ 新建条目</button>
      </div>
      {loading ? (
        <p className="we-workshop-empty">加载中…</p>
      ) : items.length === 0 ? (
        <p className="we-workshop-empty">暂无引用该字段的条目</p>
      ) : (
        <ul className="we-workshop-entry-items">
          {items.map(({ entry, otherFields }) => (
            <li key={entry.id}>
              <button className="we-workshop-entry-item" onClick={() => onEdit(entry)}>
                <span className="we-workshop-entry-title">{entry.title || '（无标题）'}</span>
                {otherFields.length > 0 && (
                  <span className="we-workshop-entry-cross" title={`还引用了：${otherFields.join('、')}`}>
                    还引用了：{otherFields.join('、')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// target_field 形如 "世界.字段名" 或 "世界.字段名.列key"，取前两段（scope.label）
function fieldOfCondition(targetField) {
  if (!targetField) return '';
  const parts = String(targetField).split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : targetField;
}

// ── 新建系统向导：定义字段 → 设默认值 → 配触发条目（可跳过）──
function NewSystemWizard({ worldId, scope, scopeKey, onClose, onFinish }) {
  const [step, setStep] = useState(1);
  const [createdField, setCreatedField] = useState(null);
  // 用 ref 实时记录是否已建字段：StateFieldEditor 保存后会同步调用 onClose，
  // 而 onClose 闭包捕获的 createdField 仍是建字段前的旧值（null），靠它判断会误关向导。
  const createdRef = useRef(null);

  // step1：复用 StateFieldEditor 创建字段。保存成功 → 推进到 step2；
  // 其内部随后调用的 onClose 因 createdRef 已置位而放行（不取消向导）。
  if (step === 1) {
    return (
      <StateFieldEditor
        field={null}
        scope={scopeKey}
        onSave={async (payload) => {
          const created = await scope.createFn(worldId, payload);
          const field = created ?? { field_key: payload.field_key, label: payload.label, type: payload.type };
          createdRef.current = field;
          setCreatedField(field);
          setStep(2);
        }}
        onClose={() => { if (!createdRef.current) onClose(); }}
      />
    );
  }

  if (step === 2) {
    return (
      <WizardShell title={`设置各${scope.label}默认值`} step={2}
        onClose={onClose}
        footer={(
          <>
            <button className="we-btn we-btn-secondary" onClick={() => onFinish(createdField?.field_key)}>
              跳过，不配条目
            </button>
            <button className="we-btn we-btn-primary" onClick={() => setStep(3)}>下一步：配触发条目</button>
          </>
        )}
      >
        <DefaultValueMatrix worldId={worldId} scope={scope} field={createdField} />
      </WizardShell>
    );
  }

  // step3：复用 EntryEditor，预填刚建字段为条件
  return (
    <EntryEditor
      worldId={worldId}
      entry={null}
      defaultTriggerType="state"
      prefillCondition={{ scope: scope.cnScope, field_label: createdField.label }}
      onClose={() => onFinish(createdField?.field_key)}
      onSave={() => onFinish(createdField?.field_key)}
    />
  );
}

function WizardShell({ title, step, children, footer, onClose }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center bg-black/60 px-4">
      <div className="we-dialog-panel w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="we-dialog-header flex items-center justify-between">
          <h2>新建系统 · 第 {step}/3 步</h2>
          <button className="we-btn we-btn-sm we-btn-ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="we-dialog-body flex flex-col gap-4">
          <p className="we-workshop-section-title">{title}</p>
          {children}
        </div>
        <div className="we-dialog-footer">{footer}</div>
      </div>
    </div>
  );
}
