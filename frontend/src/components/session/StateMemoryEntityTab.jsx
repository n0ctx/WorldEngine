import { useMemo, useState } from 'react';
import EmptyState from '../ui/EmptyState.jsx';
import { Search } from 'lucide-react';
import Input from '../ui/Input.jsx';
import ListItem from '../ui/ListItem.jsx';
import SectionTitle from '../ui/SectionTitle.jsx';
import StateMemoryEntityDetail, { PinIcon } from './StateMemoryEntityDetail.jsx';

const ENTITY_TYPE_LABELS = {
  character: '角色',
  location: '地点',
  item: '物品',
  faction: '势力',
  other: '其他',
  player: '玩家',
};

function matchesSearch(entity, keyword) {
  if (!keyword) return true;
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  if (entity.name.toLowerCase().includes(needle)) return true;
  return (entity.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
}

/** 按 types 的顺序分组，组内已退场的排在末尾 */
function groupEntitiesByType(entities, types) {
  const byType = new Map();
  for (const entity of entities) {
    if (!byType.has(entity.type)) byType.set(entity.type, []);
    byType.get(entity.type).push(entity);
  }
  return types
    .filter((type) => byType.has(type))
    .map((type) => ({
      type,
      entities: [...byType.get(type)].sort((a, b) => Number(a.status === 'retired') - Number(b.status === 'retired')),
    }));
}

function SearchIcon() {
  return (
    <Search size={16} className="we-sm-search-icon" />
  );
}

function EntityListItem({ entity, active, present, onSelect }) {
  const retired = entity.status === 'retired';
  return (
    <ListItem
      selected={active}
      className={`we-sm-entity-item${retired ? ' is-retired' : ''}`}
      title={entity.name}
      onClick={onSelect}
    >
      <span className={`we-sm-presence-dot${present ? ' is-present' : ''}`} aria-hidden="true" />
      <span className="we-sm-entity-name">{entity.name}</span>
      {entity.pinned && <span className="we-sm-entity-pin" aria-label="已置顶"><PinIcon /></span>}
      {retired && <span className="we-sm-entity-retired">已退场</span>}
    </ListItem>
  );
}

/** 一个实体页签（角色 / 地点 / 物品 / 势力）：types 决定收哪些类型、按什么顺序分组 */
export default function StateMemoryEntityTab({ sessionId, data, schema, reload, types, intro }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const entities = useMemo(() => (data?.entities ?? []).filter((entity) => types.includes(entity.type)), [data, types]);
  const presentIds = useMemo(() => new Set(data?.presentIds ?? []), [data]);
  const filtered = useMemo(
    () => entities.filter((entity) => matchesSearch(entity, search)),
    [entities, search],
  );
  const groups = useMemo(() => groupEntitiesByType(filtered, types), [filtered, types]);

  // 没选或所选已被搜索过滤掉时，默认显示列表里第一个仍在场上的实体
  const ordered = groups.flatMap((group) => group.entities);
  const selected = ordered.find((entity) => entity.entity_id === selectedId)
    ?? ordered.find((entity) => entity.status === 'active')
    ?? ordered[0]
    ?? null;

  return (
    <div className="we-sm-entity-tab">
      <div className="we-sm-entity-list">
        <p className="we-sm-intro">{intro}</p>
        <label className="we-sm-search">
          <SearchIcon />
          <Input
            size="sm"
            placeholder="搜索名字或别名"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="搜索实体"
          />
        </label>
        {groups.length === 0 && (
          <EmptyState size="sm" title={search.trim() ? '没有匹配的名字' : '暂无记录'} />
        )}
        {groups.map(({ type, entities: groupEntities }) => (
          <div key={type} className="we-sm-entity-group">
            {groups.length > 1 && (
              <SectionTitle level="eyebrow" actions={<span className="we-sm-group-count">{groupEntities.length}</span>}>
                {ENTITY_TYPE_LABELS[type] ?? type}
              </SectionTitle>
            )}
            {groupEntities.map((entity) => (
              <EntityListItem
                key={entity.entity_id}
                entity={entity}
                active={entity.entity_id === selected?.entity_id}
                present={presentIds.has(entity.entity_id)}
                onSelect={() => setSelectedId(entity.entity_id)}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="we-sm-entity-detail-pane">
        {selected ? (
          <StateMemoryEntityDetail
            key={selected.entity_id}
            sessionId={sessionId}
            entity={selected}
            typeLabel={ENTITY_TYPE_LABELS[selected.type] ?? selected.type}
            present={presentIds.has(selected.entity_id)}
            schema={schema}
            reload={reload}
            onClosed={() => setSelectedId(null)}
          />
        ) : (
          <EmptyState size="sm" title="选择左侧条目查看详情" />
        )}
      </div>
    </div>
  );
}
