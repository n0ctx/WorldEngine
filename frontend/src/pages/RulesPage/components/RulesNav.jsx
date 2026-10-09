import { useRef } from 'react';
import Badge from '../../../components/ui/Badge.jsx';
import BounceRail from '../../../components/motion/BounceRail.jsx';
import ListItem from '../../../components/ui/ListItem.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
import { FIELD_SCOPE_KEYS, SCOPES, TRIGGER_TYPES } from '../constants.js';

// 左栏导航项：选中态同时写 selected（底色）和 aria-current（读屏，也是弹跳圆点的定位依据）
const navItemProps = (active) => ({
  'data-bounce-item': true,
  'aria-current': active ? 'page' : undefined,
  selected: active,
  className: 'we-workshop-nav-item',
});

export default function RulesNav({
  navMode, entryFilter, fieldScopeKey, entries, triggerCounts, fieldsByScope,
  onSelectEntryGroup, onSelectFieldScope,
}) {
  const navRef = useRef(null);

  return (
    <nav ref={navRef} className="we-workshop-nav we-on-shell">
      <BounceRail containerRef={navRef} activeKey={`${navMode}:${entryFilter}:${fieldScopeKey}`} />
      <div className="we-workshop-nav-group">
        <SectionTitle level="eyebrow" className="we-workshop-nav-group-title">设定条目</SectionTitle>
        <ListItem
          data-testid="nav-entries-all"
          {...navItemProps(navMode === 'entries' && entryFilter === 'all')}
          onClick={() => onSelectEntryGroup('all')}
        >
          <span>全部</span>
          <Badge>{entries.length}</Badge>
        </ListItem>
        {TRIGGER_TYPES.map(({ key, label }) => (
          <ListItem
            key={key}
            data-testid={`nav-entries-${key}`}
            data-trigger={key}
            {...navItemProps(navMode === 'entries' && entryFilter === key)}
            onClick={() => onSelectEntryGroup(key)}
          >
            <span>{label}</span>
            <Badge>{triggerCounts[key]}</Badge>
          </ListItem>
        ))}
      </div>

      <div className="we-workshop-nav-group">
        <SectionTitle level="eyebrow" className="we-workshop-nav-group-title">状态字段</SectionTitle>
        {FIELD_SCOPE_KEYS.map((k) => (
          <ListItem
            key={k}
            data-testid={`nav-fields-${k}`}
            {...navItemProps(navMode === 'fields' && fieldScopeKey === k)}
            onClick={() => onSelectFieldScope(k)}
          >
            <span>{SCOPES[k].label}状态</span>
            <Badge>{fieldsByScope[k].length}</Badge>
          </ListItem>
        ))}
      </div>
    </nav>
  );
}
