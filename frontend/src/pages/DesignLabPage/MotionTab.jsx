/**
 * 设计实验室的「动效」分页：按动效位清单（slots.js）分类展示全站受动效控制的地方，
 * 每个动效位一块演示，标明用到的动效接口和用在哪些组件。
 * 主题、动效与世界强调色由页面顶部统一切换。
 */
import { useState } from 'react';
import { DEMOS } from './demos/index.js';
import Section from './Section.jsx';
import { SlotMeta } from './SlotSection.jsx';
import { CATEGORIES, SLOTS } from './slots.js';

export default function MotionTab() {
  const [category, setCategory] = useState(CATEGORIES[0].id);
  const slots = SLOTS.filter((slot) => slot.category === category);
  return (
    <>
      <nav className="we-design-lab__section" aria-label="动效分类">
        <div className="we-design-lab__chips we-design-lab__chips--inline" role="group">
          {CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="we-design-lab__chip"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
              <span className="we-design-lab__count">{SLOTS.filter((slot) => slot.category === item.id).length}</span>
            </button>
          ))}
        </div>
      </nav>
      {slots.map((slot) => {
        const Demo = DEMOS[slot.id];
        return Demo ? <Demo key={slot.id} /> : <SlotPlaceholder key={slot.id} slot={slot} />;
      })}
    </>
  );
}

function SlotPlaceholder({ slot }) {
  return <Section id={`slot-${slot.id}`} title={slot.title} meta={<SlotMeta slot={slot} />} />;
}
