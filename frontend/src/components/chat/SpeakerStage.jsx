import { AnimatePresence, motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import CharacterSeal from './CharacterSeal.jsx';

// 会话页台前：当前说话的角色。换角色时旧角色退场、新角色从侧面走上台
export default function SpeakerStage({ character }) {
  const m = useMotion();
  return (
    <div className="we-speaker-stage">
      <AnimatePresence mode="wait" initial={false}>
        {character ? (
          <motion.div
            key={character.id}
            className="we-speaker-stage__cast we-material"
            variants={m.variant('speakerEnter')}
            initial="hidden"
            animate="visible"
            exit={{ opacity: 0, transition: m.transition('retract') }}
            transition={m.spring('speaker')}
          >
            <span className="we-speaker-stage__halo">
              <CharacterSeal character={character} size={56} />
            </span>
            <span className="we-speaker-stage__text">
              <span className="we-speaker-stage__name">{character.name}</span>
              {character.description ? (
                <span className="we-speaker-stage__line">{character.description}</span>
              ) : null}
            </span>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
