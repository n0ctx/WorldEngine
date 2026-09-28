import { useState } from 'react';
import StateMemoryProfileField from './StateMemoryProfileField.jsx';
import StateMemoryDynamicState from './StateMemoryDynamicState.jsx';
import StateMemoryEntityFields from './StateMemoryEntityFields.jsx';
import { updateStateEntity } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

const PROFILE_GROUP_ORDER = ['身份', '外貌', '人格', '经历'];
const CARD_SUMMARY_MAX = 120;

function groupedVisibleFields(schema, entity) {
  const allDefs = schema?.profileFields?.character ?? [];
  const activeKeys = new Set(entity.activeProfileFields ?? []);
  const visible = allDefs.filter((def) => activeKeys.has(def.key) && entity.profile?.[def.key]?.value != null);
  const byGroup = new Map();
  for (const def of visible) {
    const group = def.group || '';
    if (!byGroup.has(group)) byGroup.set(group, []);
    byGroup.get(group).push(def);
  }
  return PROFILE_GROUP_ORDER.filter((group) => byGroup.has(group)).map((group) => ({ group, defs: byGroup.get(group) }));
}

/** 把「位置」键排到现状小节首位，不改动共用组件 StateMemoryDynamicState 本身 */
function reorderDynamicLocationFirst(dynamic, locationKey) {
  const entries = Object.entries(dynamic ?? {});
  const idx = entries.findIndex(([key]) => key === locationKey);
  if (idx <= 0) return dynamic ?? {};
  const reordered = [...entries];
  reordered.unshift(reordered.splice(idx, 1)[0]);
  return Object.fromEntries(reordered);
}

/** 所属组织（成员关系的客体）与持有物品（持有者关系的客体），仅当本实体是关系主体时计入 */
function deriveOrgsAndItems(entity, relations, entitiesById) {
  const orgs = [];
  const items = [];
  for (const relation of relations ?? []) {
    if (relation.subject_id !== entity.entity_id) continue;
    const label = relation.object_id ? (entitiesById.get(relation.object_id)?.name ?? null) : relation.object_value;
    if (!label) continue;
    if (relation.predicate === '成员') orgs.push(label);
    else if (relation.predicate === '持有者') items.push(label);
  }
  return { orgs, items };
}

function ProfileFieldRow({ def, entity, diffKeys, onCommit }) {
  const changed = diffKeys?.has(`${entity.entity_id}:profile.${def.key}`) ?? false;
  return (
    <div className={`we-sm-profile-row${changed ? ' we-status-field--changed' : ''}`}>
      <StateMemoryProfileField
        fieldDef={def}
        entry={entity.profile?.[def.key]}
        age={def.key === 'age_recorded' ? entity.age : undefined}
        onCommit={(value) => onCommit(def.key, value)}
      />
    </div>
  );
}

function DerivedRow({ label, values }) {
  if (values.length === 0) return null;
  return (
    <div className="we-status-field">
      <span className="we-status-key">{label}</span>
      <span className="we-status-value">{values.join('、')}</span>
    </div>
  );
}

function CardProfileSummary({ entity, outfitDef, diffKeys, onCommit }) {
  return (
    <>
      {entity.card_description && (
        <p className="we-status-value we-sm-card-summary">
          {entity.card_description.length > CARD_SUMMARY_MAX
            ? `${entity.card_description.slice(0, CARD_SUMMARY_MAX)}…`
            : entity.card_description}
        </p>
      )}
      {outfitDef && (
        <div className="we-fields-list">
          <ProfileFieldRow def={outfitDef} entity={entity} diffKeys={diffKeys} onCommit={onCommit} />
        </div>
      )}
    </>
  );
}

function ProfileGroups({ groups, entity, diffKeys, onCommit }) {
  return groups.map(({ group, defs }) => (
    <div key={group} className="we-state-section we-sm-profile-subgroup">
      <div className="we-state-section-title we-state-section-title--sub">
        <span className="we-section-label">{group}</span>
      </div>
      <div className="we-fields-list">
        {defs.map((def) => (
          <ProfileFieldRow key={def.key} def={def} entity={entity} diffKeys={diffKeys} onCommit={onCommit} />
        ))}
      </div>
    </div>
  ));
}

/**
 * 两种模式共用的 NPC 状态区块：档案（按身份/外貌/人格/经历分组，卡片角色只显示摘要 + 穿着）
 * + 所属/持有（关系派生，只读）+ 现状（AI 动态状态）+ 用户字段。
 */
export default function EntityStateBlock({ sessionId, entity, schema, entities, relations, diffKeys, reload }) {
  const [error, setError] = useState('');
  const isCardEntity = !!entity.card_id;
  const outfitDef = (schema?.profileFields?.character ?? []).find((def) => def.key === 'outfit');
  const groups = isCardEntity ? [] : groupedVisibleFields(schema, entity);
  const entitiesById = new Map((entities ?? []).map((e) => [e.entity_id, e]));
  const { orgs, items } = deriveOrgsAndItems(entity, relations, entitiesById);
  const locationKey = schema?.dynamicLocationKey ?? '位置';
  const orderedDynamicEntity = { ...entity, dynamic: reorderDynamicLocationFirst(entity.dynamic, locationKey) };

  async function commitProfileField(fieldKey, value) {
    setError('');
    try {
      await updateStateEntity(sessionId, entity.entity_id, { profile: { [fieldKey]: value } });
      reload();
    } catch (err) {
      log.error('state.entity.profile_update_failed', err, { toast: err?.message || '保存失败' });
      setError(err.message || '保存失败');
    }
  }

  return (
    <div className="we-entity-state-block">
      <div className="we-state-section we-entity-profile-group">
        <div className="we-state-section-title">
          <span className="we-section-label">档案</span>
        </div>
        {isCardEntity ? (
          <CardProfileSummary entity={entity} outfitDef={outfitDef} diffKeys={diffKeys} onCommit={commitProfileField} />
        ) : (
          <ProfileGroups groups={groups} entity={entity} diffKeys={diffKeys} onCommit={commitProfileField} />
        )}
        {(orgs.length > 0 || items.length > 0) && (
          <div className="we-fields-list we-sm-derived">
            <DerivedRow label="所属" values={orgs} />
            <DerivedRow label="持有" values={items} />
          </div>
        )}
      </div>

      <div className="we-entity-dynamic">
        <StateMemoryDynamicState sessionId={sessionId} entity={orderedDynamicEntity} reload={reload} />
      </div>

      <StateMemoryEntityFields sessionId={sessionId} entity={entity} reload={reload} />

      {error && (
        <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">{error}</p>
      )}
    </div>
  );
}
