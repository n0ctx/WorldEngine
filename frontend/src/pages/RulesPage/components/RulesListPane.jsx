import { EntryOrderList, EntryPlainList } from './EntryLists.jsx';
import { TRIGGER_TYPES, TYPE_LABEL, UNGROUPED } from '../constants.js';

export default function RulesListPane({
  navMode,
  entryFilter, orderMode, setOrderMode, setSelectedEntryId, setCreatingEntry,
  triggerTypeFilter, setTriggerTypeFilter,
  entries, filteredEntries, selectedEntryId,
  onSelectEntry, onToggleEntry, onDeleteEntry, onReorderEntries, onReorderEntriesEnd,
  fieldScope, fields, selectedFieldKey, setSelectedFieldKey, setCreatingField,
}) {
  if (navMode === 'entries') {
    return (
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
            onReorder={onReorderEntries}
            onReorderEnd={onReorderEntriesEnd}
            onToggle={onToggleEntry}
          />
        ) : (
          <EntryPlainList
            entries={filteredEntries}
            selectedId={selectedEntryId}
            onSelect={onSelectEntry}
            onToggle={onToggleEntry}
            onDelete={onDeleteEntry}
          />
        )}
      </section>
    );
  }

  return (
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
  );
}
