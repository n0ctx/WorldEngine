/**
 * 设计实验室的「视觉」分页：按视觉位清单（visualSlots.js）分类展示主题能改的每一类视觉取值，
 * 每个视觉位一块演示，标明它认领的 token 和用在哪。切换顶部的主题时整页跟着变。
 */
import { useState } from 'react';
import Section from './Section.jsx';
import { SlotMeta } from './SlotSection.jsx';
import { VISUAL_DEMOS } from './visual/index.js';
import { VISUAL_CATEGORIES, VISUAL_SLOTS } from './visualSlots.js';

export default function VisualTab() {
  const [category, setCategory] = useState(VISUAL_CATEGORIES[0].id);
  const slots = VISUAL_SLOTS.filter((slot) => slot.category === category);
  return (
    <>
      <nav className="we-design-lab__section" aria-label="视觉分类">
        <div className="we-design-lab__chips we-design-lab__chips--inline" role="group">
          {VISUAL_CATEGORIES.map((item) => (
            <button
              key={item.id}
              type="button"
              className="we-design-lab__chip"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
              <span className="we-design-lab__count">{VISUAL_SLOTS.filter((slot) => slot.category === item.id).length}</span>
            </button>
          ))}
        </div>
      </nav>
      {slots.map((slot) => {
        const Demo = VISUAL_DEMOS[slot.id];
        return Demo
          ? <Demo key={slot.id} />
          : <Section key={slot.id} id={`visual-${slot.id}`} title={slot.title} meta={<SlotMeta slot={slot} />} />;
      })}
    </>
  );
}
