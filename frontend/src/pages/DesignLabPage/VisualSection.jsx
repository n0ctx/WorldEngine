import Section from './Section.jsx';
import { SlotMeta } from './SlotSection.jsx';
import { VISUAL_SLOT_BY_ID } from './visualSlots.js';

/** 一个视觉位的演示区：标题、认领的 token、用在哪都取自清单（visualSlots.js）。 */
export default function VisualSection({ id, actions, children, stageClassName }) {
  const slot = VISUAL_SLOT_BY_ID[id];
  return (
    <Section
      id={`visual-${id}`}
      title={slot.title}
      meta={<SlotMeta slot={slot} />}
      actions={actions}
      stageClassName={stageClassName}
    >
      {children}
    </Section>
  );
}
