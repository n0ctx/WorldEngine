import { AnimatePresence, motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import { getAvatarUrl } from '../../core/utils/avatar.js';
import CharacterSeal from './CharacterSeal.jsx';
import WorldArt from './WorldArt.jsx';

/* 大台前：上半是世界画，有头像时角色立绘压在正文列右边线上，名字用展示字号落在正文左边线上。
   没有角色（写作页）时大标题是世界名、下面是世界简介。按角色（或世界）挂载，换人时整块重新上台，动作由当前动效包决定 */
function StageHero({ world, character }) {
  const portrait = getAvatarUrl(character?.avatar_path);
  const headline = character?.name ?? world?.name;
  const intro = character ? character.description : world?.description;
  return (
    <div className="we-speaker-stage__hero">
      {world ? (
        <div className="we-speaker-stage__art" aria-hidden="true">
          <WorldArt world={world} className="we-speaker-stage__scene" />
        </div>
      ) : null}
      {portrait && <img src={portrait} alt="" className="we-speaker-stage__portrait" />}
      <div className="we-speaker-stage__title">
        {character && world?.name ? <span className="we-speaker-stage__world">{world.name}</span> : null}
        <span className="we-speaker-stage__headline" data-text={headline}>{headline}</span>
        {intro ? <span className="we-speaker-stage__intro">{intro}</span> : null}
      </div>
    </div>
  );
}

/**
 * 正文顶部的台前。对话页是当前说话的角色：正文在顶部时是一整块大台前，正文往下滚（compact）时
 * 大台前上滑收走，换成一行台前（印章 + 名字 + 简介），换角色时旧角色退场、新角色从侧面走上台。
 * 写作页不传 character，只有世界的大台前，收起后不留一行。
 */
export default function SpeakerStage({ character = null, world = null, compact = false }) {
  const m = useMotion();
  const hasHero = Boolean(character || world);
  return (
    <div
      className="we-speaker-stage"
      data-compact={compact || !hasHero || undefined}
      data-bare={!character || undefined}
    >
      {hasHero ? (
        <div className="we-speaker-stage__hero-slot" aria-hidden={compact}>
          <StageHero key={character?.id ?? world.id} world={world} character={character} />
        </div>
      ) : null}
      <div className="we-speaker-stage__bar" aria-hidden={!compact}>
        <AnimatePresence mode="wait" initial={false}>
          {character ? (
            <motion.div
              key={character.id}
              className="we-speaker-stage__cast"
              variants={m.variant('enter')}
              initial="hidden"
              animate="visible"
              exit="exit"
              transition={m.transition('enter')}
            >
              <CharacterSeal character={character} size={32} />
              <span className="we-speaker-stage__name">{character.name}</span>
              {character.description ? (
                <span className="we-speaker-stage__line">{character.description}</span>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
