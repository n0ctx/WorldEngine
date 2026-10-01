import Badge from '../../../components/ui/Badge.jsx';
import DeleteButton from '../../../components/motion/DeleteButton.jsx';
import Button from '../../../components/ui/Button.jsx';
import { EntryOrderList, EntryPlainList } from './EntryLists.jsx';
import { TRIGGER_LABEL, TYPE_LABEL } from '../constants.js';

const PROFILE_BADGE = { world: '时间 / 地点', character: '身份 / 外貌 / 人格', persona: '身份 / 外貌' };

export default function RulesListPane({
  navMode,
  entryFilter, orderMode, setOrderMode, setSelectedEntryId, setCreatingEntry,
  entries, filteredEntries, selectedEntryId,
  onSelectEntry, onToggleEntry, onDeleteEntry, onReorderEntries, onReorderEntriesEnd,
  fieldScope, fields, selectedFieldKey, setSelectedFieldKey, setCreatingField, onDeleteField,
}) {
  if (navMode === 'entries') {
    return (
      <section className="we-workshop-list">
        <div className="we-workshop-list-head we-on-shell">
          <span>
            {entryFilter === 'all' ? '全部条目' : `「${TRIGGER_LABEL[entryFilter]}」条目`}
          </span>
          <div className="we-workshop-list-actions">
            <Button
              size="sm"
              variant={orderMode ? 'primary' : 'secondary'}
              onClick={() => { setOrderMode((v) => !v); setSelectedEntryId(null); setCreatingEntry(false); }}
            >
              {orderMode ? '完成排序' : '调整顺序'}
            </Button>
            {!orderMode && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => { setCreatingEntry(true); setSelectedEntryId(null); }}
              >
                + 新建
              </Button>
            )}
          </div>
        </div>

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
      <div className="we-workshop-list-head we-on-shell">
        <span>{fieldScope.label}字段</span>
        <Button size="sm" variant="secondary" onClick={() => setCreatingField(true)}>+ 添加</Button>
      </div>
      {PROFILE_BADGE[fieldScope.key] && (
        <div className="we-entry-section-list">
          <div
            role="button"
            tabIndex={0}
            data-testid={`${fieldScope.key}-profile-defaults`}
            className={`we-entry-section-row we-entry-section-row--selectable${selectedFieldKey === 'profile' ? ' is-selected' : ''}`}
            onClick={() => setSelectedFieldKey('profile')}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFieldKey('profile'); } }}
          >
            <div className="we-entry-section-main">
              <div className="we-entry-section-title-line">
                <span className="we-entry-section-name">档案默认值</span>
                <Badge>{PROFILE_BADGE[fieldScope.key]}</Badge>
              </div>
            </div>
          </div>
        </div>
      )}
      {fields.length === 0 ? (
        <div className="we-entry-section-empty">暂无字段</div>
      ) : (
        <div className="we-entry-section-list" data-testid="field-list">
          {fields.map((f) => (
            <div
              key={f.field_key}
              role="button"
              tabIndex={0}
              className={`we-entry-section-row we-entry-section-row--selectable${f.field_key === selectedFieldKey ? ' is-selected' : ''}`}
              onClick={() => setSelectedFieldKey(f.field_key)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedFieldKey(f.field_key); } }}
            >
              <div className="we-entry-section-main">
                <div className="we-entry-section-title-line">
                  <span className="we-entry-section-name">{f.label}</span>
                  <Badge>{TYPE_LABEL[f.type] ?? f.type}</Badge>
                </div>
              </div>
              <div className="we-entry-section-actions">
                <DeleteButton label={`删除字段「${f.label}」`} onConfirm={() => onDeleteField(f)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
