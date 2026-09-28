import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import RulesHeader from './components/RulesHeader.jsx';
import RulesNav from './components/RulesNav.jsx';
import RulesListPane from './components/RulesListPane.jsx';
import RulesDetailPane from './components/RulesDetailPane.jsx';
import RulesModals from './components/RulesModals.jsx';
import { useRulesData } from './hooks/useRulesData.js';
import { SCOPES, UNGROUPED } from './constants.js';

export default function RulesPage() {
  const { worldId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // ── 设定条目 ──
  const [entryFilter, setEntryFilter] = useState('all'); // all | 分组名 | UNGROUPED（左栏导航）
  const [triggerTypeFilter, setTriggerTypeFilter] = useState('all'); // all | always | keyword | llm | state（中栏筛选 chip）
  const [orderMode, setOrderMode] = useState(false);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [creatingEntry, setCreatingEntry] = useState(false);

  // ── 状态字段 ──
  const [fieldScopeKey, setFieldScopeKey] = useState('character');
  const [selectedFieldKey, setSelectedFieldKey] = useState(null);
  const [creatingField, setCreatingField] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // 顶层导航：'entries'（设定条目）| 'fields'（状态字段）。旧的 /state-workshop
  // 路由重定向到 ?tab=state，落在这里默认打开状态字段视图。
  const [navMode, setNavMode] = useState(searchParams.get('tab') === 'state' ? 'fields' : 'entries');

  const {
    entries, setEntries, refreshEntries,
    fieldsByScope, loadFieldsFor,
    groupList, existingGroupNames,
    handleDeleteEntry, handleToggleEntry, handleReorderEntriesEnd,
    handleDeleteField,
  } = useRulesData(worldId, { selectedEntryId, setSelectedEntryId });

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

  async function deleteField(field) {
    const deleted = await handleDeleteField(fieldScopeKey, field);
    if (deleted && field.field_key === selectedFieldKey) setSelectedFieldKey(null);
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
        <RulesHeader
          onBack={() => navigate(`/worlds/${worldId}`)}
          onOpenWizard={() => setWizardOpen(true)}
        />

        <div className="we-workshop-body we-workshop-body--3col">
          {/* 左：导航 */}
          <RulesNav
            navMode={navMode}
            entryFilter={entryFilter}
            fieldScopeKey={fieldScopeKey}
            entries={entries}
            groupList={groupList}
            fieldsByScope={fieldsByScope}
            onSelectEntryGroup={selectEntryGroup}
            onSelectFieldScope={selectFieldScope}
          />

          {/* 中：列表 */}
          <RulesListPane
            navMode={navMode}
            entryFilter={entryFilter}
            orderMode={orderMode}
            setOrderMode={setOrderMode}
            setSelectedEntryId={setSelectedEntryId}
            setCreatingEntry={setCreatingEntry}
            triggerTypeFilter={triggerTypeFilter}
            setTriggerTypeFilter={setTriggerTypeFilter}
            entries={entries}
            filteredEntries={filteredEntries}
            selectedEntryId={selectedEntryId}
            onSelectEntry={(entry) => { setSelectedEntryId(entry.id); setCreatingEntry(false); }}
            onToggleEntry={handleToggleEntry}
            onDeleteEntry={handleDeleteEntry}
            onReorderEntries={setEntries}
            onReorderEntriesEnd={handleReorderEntriesEnd}
            fieldScope={fieldScope}
            fields={fields}
            selectedFieldKey={selectedFieldKey}
            setSelectedFieldKey={setSelectedFieldKey}
            setCreatingField={setCreatingField}
            onDeleteField={deleteField}
          />

          {/* 右：详情 */}
          <RulesDetailPane
            navMode={navMode}
            orderMode={orderMode}
            creatingEntry={creatingEntry}
            selectedEntry={selectedEntry}
            worldId={worldId}
            defaultGroupNameForNew={defaultGroupNameForNew}
            existingGroupNames={existingGroupNames}
            setCreatingEntry={setCreatingEntry}
            setSelectedEntryId={setSelectedEntryId}
            refreshEntries={refreshEntries}
            entries={entries}
            fieldsByScope={fieldsByScope}
            selectedField={selectedField}
            fieldScope={fieldScope}
            fieldScopeKey={fieldScopeKey}
            loadFieldsFor={loadFieldsFor}
          />
        </div>
      </div>

      <RulesModals
        creatingField={creatingField}
        fieldScopeKey={fieldScopeKey}
        fieldScope={fieldScope}
        worldId={worldId}
        loadFieldsFor={loadFieldsFor}
        setSelectedFieldKey={setSelectedFieldKey}
        setCreatingField={setCreatingField}
        wizardOpen={wizardOpen}
        setWizardOpen={setWizardOpen}
        setNavMode={setNavMode}
      />
    </div>
  );
}
