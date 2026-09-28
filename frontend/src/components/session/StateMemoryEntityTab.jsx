import { useMemo, useState } from 'react';
import StateMemoryEntityDetail from './StateMemoryEntityDetail.jsx';

const ENTITY_TYPE_LABELS = {
  character: '角色',
  location: '地点',
  item: '物品',
  faction: '势力',
  other: '其他',
  player: '玩家',
};

const ENTITY_TYPE_ORDER = ['character', 'location', 'item', 'faction', 'other', 'player'];

function matchesSearch(entity, keyword) {
  if (!keyword) return true;
  const needle = keyword.trim().toLowerCase();
  if (!needle) return true;
  if (entity.name.toLowerCase().includes(needle)) return true;
  return (entity.aliases ?? []).some((alias) => alias.toLowerCase().includes(needle));
}

function groupEntitiesByType(entities) {
  const byType = new Map();
  for (const entity of entities) {
    if (!byType.has(entity.type)) byType.set(entity.type, []);
    byType.get(entity.type).push(entity);
  }
  return ENTITY_TYPE_ORDER
    .filter((type) => byType.has(type))
    .map((type) => ({ type, entities: byType.get(type) }));
}

export default function StateMemoryEntityTab({ sessionId, data, schema, reload }) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const entities = useMemo(() => data?.entities ?? [], [data]);
  const filtered = useMemo(
    () => entities.filter((entity) => matchesSearch(entity, search)),
    [entities, search],
  );
  const groups = useMemo(() => groupEntitiesByType(filtered), [filtered]);
  const selected = entities.find((entity) => entity.entity_id === selectedId) ?? null;

  return (
    <div className="we-sm-entity-tab">
      <div className="we-sm-entity-list">
        <input
          className="we-input we-sm-search"
          placeholder="按名字或别名搜索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="搜索实体"
        />
        {groups.length === 0 && <p className="we-section-empty">暂无实体</p>}
        {groups.map(({ type, entities: groupEntities }) => (
          <div key={type} className="we-sm-entity-group">
            <div className="we-state-section-title">
              <span className="we-section-label">{ENTITY_TYPE_LABELS[type] ?? type}</span>
            </div>
            {groupEntities.map((entity) => (
              <button
                key={entity.entity_id}
                type="button"
                className={`we-sm-entity-item${entity.entity_id === selectedId ? ' active' : ''}`}
                onClick={() => setSelectedId(entity.entity_id)}
              >
                <span>{entity.name}</span>
                {entity.status === 'retired' && <span className="we-sm-entity-retired">已退场</span>}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="we-sm-entity-detail-pane">
        {selected ? (
          <StateMemoryEntityDetail
            sessionId={sessionId}
            entity={selected}
            schema={schema}
            reload={reload}
            onClosed={() => setSelectedId(null)}
          />
        ) : (
          <p className="we-section-empty">选择左侧实体查看详情</p>
        )}
      </div>
    </div>
  );
}
