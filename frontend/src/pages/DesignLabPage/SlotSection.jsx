import Section from './Section.jsx';
import { SLOT_BY_ID, STATUS_LABEL } from './slots.js';
import { VISUAL_STATUS_LABEL } from './visualSlots.js';

export function SlotMeta({ slot }) {
  return (
    <div className="we-design-lab__meta">
      <span className={`we-design-lab__status we-design-lab__status--${slot.status}`}>
        {STATUS_LABEL[slot.status] ?? VISUAL_STATUS_LABEL[slot.status]}
      </span>
      {slot.tokens
        ? <span>token：{slot.tokens.length ? slot.tokens.join('、') : '无专属 token'}</span>
        : <span>接口：{slot.api.length ? slot.api.join('、') : '无'}</span>}
      {slot.hooks && <span>接管：{slot.hooks.map((name) => `.${name}`).join('、')}</span>}
      <span>用在：{slot.usedIn.join('、')}</span>
      {slot.note && <span className="we-design-lab__meta-note">{slot.note}</span>}
    </div>
  );
}

/** 一个动效位的演示区：标题、接口、用在哪都取自清单（slots.js）。 */
export default function SlotSection({ id, actions, children, stageClassName }) {
  const slot = SLOT_BY_ID[id];
  return (
    <Section
      id={`slot-${id}`}
      title={slot.title}
      meta={<SlotMeta slot={slot} />}
      actions={actions}
      stageClassName={stageClassName}
    >
      {children}
    </Section>
  );
}
