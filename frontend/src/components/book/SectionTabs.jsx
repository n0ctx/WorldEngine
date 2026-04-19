import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { MOTION } from '../../utils/motion';

export default function SectionTabs({ sections, defaultKey }) {
  const [active, setActive] = useState(defaultKey ?? sections[0]?.key);
  const current = sections.find(s => s.key === active);

  return (
    <div className="we-section-tabs">
      <div className="we-section-tabs-bar">
        {sections.map(s => (
          <button
            key={s.key}
            className={`we-section-tab${active === s.key ? ' active' : ''}`}
            onClick={() => setActive(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="we-section-tabs-sep">
        <div className="we-section-tabs-sep-line" />
        <span className="we-section-tabs-sep-fleuron">❦</span>
        <div className="we-section-tabs-sep-line" />
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: MOTION.duration.quick }}
        >
          {current?.content}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
