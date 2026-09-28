import EntryEditor from '../../../components/state/EntryEditor';
import RulesOverview from './RulesOverview.jsx';
import FieldDetail from './FieldDetail.jsx';

export default function RulesDetailPane({
  navMode, orderMode, creatingEntry, selectedEntry,
  worldId, defaultTriggerTypeForNew,
  setCreatingEntry, setSelectedEntryId, refreshEntries,
  entries, fieldsByScope,
  selectedField, fieldScope, fieldScopeKey, loadFieldsFor,
}) {
  return (
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
              defaultTriggerType={defaultTriggerTypeForNew}
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
          onDefinitionSaved={() => loadFieldsFor(fieldScopeKey)}
        />
      )}
    </section>
  );
}
