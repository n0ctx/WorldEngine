import { useRef } from 'react';
import BounceRail from '../../../components/motion/BounceRail.jsx';
import { FIELD_SCOPE_KEYS, SCOPES, UNGROUPED } from '../constants.js';

// 左栏导航项：选中态同时写 class（底色）和 aria-current（读屏，也是弹跳圆点的定位依据）
const navItemProps = (active) => ({
  'data-bounce-item': true,
  'aria-current': active ? 'page' : undefined,
  className: `we-workshop-nav-item${active ? ' is-active' : ''}`,
});

export default function RulesNav({
  navMode, entryFilter, fieldScopeKey, entries, groupList, fieldsByScope,
  onSelectEntryGroup, onSelectFieldScope,
}) {
  const navRef = useRef(null);

  return (
    <nav ref={navRef} className="we-workshop-nav">
      <BounceRail containerRef={navRef} activeKey={`${navMode}:${entryFilter}:${fieldScopeKey}`} />
      <div className="we-workshop-nav-group">
        <div className="we-workshop-nav-group-title">设定条目</div>
        <button
          data-testid="nav-entries-all"
          {...navItemProps(navMode === 'entries' && entryFilter === 'all')}
          onClick={() => onSelectEntryGroup('all')}
        >
          <span>全部</span>
          <span className="we-field-badge">{entries.length}</span>
        </button>
        {groupList.named.map(([name, count]) => (
          <button
            key={name}
            data-testid={`nav-entries-group-${name}`}
            {...navItemProps(navMode === 'entries' && entryFilter === name)}
            onClick={() => onSelectEntryGroup(name)}
          >
            <span>{name}</span>
            <span className="we-field-badge">{count}</span>
          </button>
        ))}
        <button
          data-testid="nav-entries-ungrouped"
          {...navItemProps(navMode === 'entries' && entryFilter === UNGROUPED)}
          onClick={() => onSelectEntryGroup(UNGROUPED)}
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
            {...navItemProps(navMode === 'fields' && fieldScopeKey === k)}
            onClick={() => onSelectFieldScope(k)}
          >
            <span>{SCOPES[k].label}状态</span>
            <span className="we-field-badge">{fieldsByScope[k].length}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
