import { useState } from 'react';
import Badge from '../../../components/ui/Badge.jsx';
import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import SortableList from '../../../components/ui/SortableList.jsx';
import BadgeEmptySketch from '../sketch/BadgeEmptySketch.jsx';
import Compare from '../sketch/Compare.jsx';
import SlotSection from '../SlotSection.jsx';
import { NAV } from './fixtures.js';

const noop = () => {};

export function SortableDemo() {
  const [items, setItems] = useState(NAV.map((label) => ({ id: label, label })));
  return (
    <SlotSection id="sortable">
      <SortableList
        items={items}
        onReorder={setItems}
        className="we-design-lab__grid"
        renderItem={(item) => <div className="we-design-lab__card we-material">{item.label}</div>}
      />
    </SlotSection>
  );
}

export function BadgeEmptyDemo() {
  const [run, setRun] = useState(0);
  return (
    <SlotSection
      id="badge-empty"
      actions={<Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>重播</Button>}
    >
      <Compare
        key={run}
        now={(
          <div className="we-design-lab__grid">
            <div className="we-design-lab__row">
              <Badge>默认</Badge>
              <Badge variant="accent">强调</Badge>
              <Badge variant="error">错误</Badge>
            </div>
            <EmptyState
              title="还没有世界"
              hint="创建第一个世界，开始写故事。"
              primaryAction={{ label: '创建世界', onClick: noop }}
              secondaryAction={{ label: '导入', onClick: noop }}
            />
          </div>
        )}
        sketch={<BadgeEmptySketch />}
      />
    </SlotSection>
  );
}
