import { useState } from 'react';
import { IconChevronDown } from '../ui/icons.jsx';
import StateMemoryDynamicState from './StateMemoryDynamicState.jsx';
import StateMemoryProfileGroups from './StateMemoryProfileGroups.jsx';
import { changedProfileKeys, visibleProfileDefs } from './profile-defs.js';

/** 把「位置」键排到现状小节首位，不改动共用组件 StateMemoryDynamicState 本身 */
function reorderDynamicLocationFirst(dynamic, locationKey) {
  const entries = Object.entries(dynamic ?? {});
  const idx = entries.findIndex(([key]) => key === locationKey);
  if (idx <= 0) return dynamic ?? {};
  const reordered = [...entries];
  reordered.unshift(reordered.splice(idx, 1)[0]);
  return Object.fromEntries(reordered);
}

/**
 * 所属组织：本实体 —成员→ 组织；持有物品：物品 —持有者→ 本实体（物品是主体，与后端 buildAffiliationText 一致）
 */
function deriveOrgsAndItems(entity, relations, entitiesById) {
  const orgs = [];
  const items = [];
  for (const relation of relations) {
    if (relation.predicate === '成员' && relation.subject_id === entity.entity_id) {
      const label = relation.object_id ? entitiesById.get(relation.object_id)?.name : relation.object_value;
      if (label) orgs.push(label);
    } else if (relation.predicate === '持有者' && relation.object_id === entity.entity_id) {
      const label = entitiesById.get(relation.subject_id)?.name;
      if (label) items.push(label);
    }
  }
  return { orgs, items };
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

/**
 * 状态栏里一个实体的区块（NPC、玩家、对话模式主角色共用）：默认只显示本轮变化的档案字段和「现状」
 * （动态状态 + 用户字段，本轮变化的行高亮），点开再看全部档案（按身份/外貌/人格分组）与关系派生的
 * 所属/持有。用户字段默认取实体自带的角色字段，玩家与主角色由调用方传 userRows（会话状态值接口的行）。
 */
export default function EntityStateBlock({
  sessionId, entity, schema, entities, relations, diffKeys, reload,
  userRows, userChangedKeys, onSaveUserRow, templateCtx,
}) {
  const [expanded, setExpanded] = useState(false);
  const profileDefs = visibleProfileDefs(schema, entity);
  const changedKeys = changedProfileKeys(entity, diffKeys);
  const changedDefs = profileDefs.filter((def) => changedKeys.has(def.key));
  const entitiesById = new Map(entities.map((e) => [e.entity_id, e]));
  const { orgs, items } = deriveOrgsAndItems(entity, relations, entitiesById);
  const locationKey = schema?.dynamicLocationKey ?? '位置';
  const orderedDynamicEntity = { ...entity, dynamic: reorderDynamicLocationFirst(entity.dynamic, locationKey) };
  const profileProps = { sessionId, entity, diffKeys, reload, templateCtx, sheetLayout: true };

  return (
    <div className="we-entity-state-block">
      {changedDefs.length > 0 && <StateMemoryProfileGroups {...profileProps} defs={changedDefs} title="本轮变化" />}

      <div className="we-entity-dynamic">
        <StateMemoryDynamicState
          sessionId={sessionId}
          entity={orderedDynamicEntity}
          diffKeys={diffKeys}
          reload={reload}
          includeUserFields={!userRows}
          userRows={userRows}
          userChangedKeys={userChangedKeys}
          onSaveUserRow={onSaveUserRow}
          templateCtx={templateCtx}
          sheetLayout
        />
      </div>

      <button
        type="button"
        className="we-state-change-toggle"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <IconChevronDown size={16} className="we-status-chevron" style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }} />
        <span>{expanded ? '收起档案' : `查看全部档案（${profileDefs.length} 项）`}</span>
      </button>

      {expanded && (
        <div className="we-entity-profile-full">
          <StateMemoryProfileGroups {...profileProps} defs={profileDefs} />
          {(orgs.length > 0 || items.length > 0) && (
            <div className="we-fields-list we-sm-derived">
              <DerivedRow label="所属" values={orgs} />
              <DerivedRow label="持有" values={items} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
