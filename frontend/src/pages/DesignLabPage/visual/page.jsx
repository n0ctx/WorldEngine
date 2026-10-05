import { motion } from 'framer-motion';
import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import MotionOrb from '../../../components/motion/MotionOrb.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import { CharacterCard } from '../../CharactersPage/components/CharacterCard.jsx';
import { NewWorldGuide } from '../../CharactersPage/components/NewWorldGuide.jsx';
import WorldsGrid from '../../WorldsPage/WorldsGrid.jsx';
import ParchmentTexture from '../../../shells/book-spread/layout/ParchmentTexture.jsx';
import VisualSection from '../VisualSection.jsx';
import { CAST, WORLDS } from '../demos/fixtures.js';

const noop = () => {};

export function PageCanvasDemo() {
  return (
    <VisualSection id="page-canvas">
      <div className="we-design-lab__page-box">
        <div className="we-worlds-header">
          <div className="we-worlds-heading">
            <p className="we-worlds-eyebrow">3 个世界</p>
            <h1 className="we-worlds-title">世界</h1>
          </div>
          <div className="we-worlds-header-actions">
            <Button variant="ghost" className="we-worlds-header-btn">导入世界卡</Button>
            <Button variant="ghost" className="we-worlds-header-btn we-worlds-header-btn--create">创建世界</Button>
          </div>
        </div>
        <NewWorldGuide completed={{ world: true }} onStepClick={noop} onDismiss={noop} />
        {CAST.map((character) => (
          <CharacterCard key={character.id} char={character} onCardClick={noop} onNewChat={noop} onEdit={noop} onDelete={noop} />
        ))}
        <ParchmentTexture opacity={0.55} />
      </div>
    </VisualSection>
  );
}

export function WorldCardDemo() {
  const m = useMotion();
  return (
    <VisualSection id="world-card">
      <div className="we-design-lab__worlds we-design-lab__desk">
        <WorldsGrid
          worlds={WORLDS}
          onReorderEnd={noop}
          actionsOpenId={null}
          setActionsOpenId={noop}
          setDeletingWorld={noop}
          exportingWorldId={null}
          reloadKey={0}
          handleExportWorld={noop}
          handleEnterWorld={noop}
          setLitWorld={noop}
        />
        <div className="we-worlds-state we-on-shell">
          <EmptyState title="世界列表读取失败" hint="网络连接中断。" primaryAction={{ label: '重试', onClick: noop }} />
        </div>
        <motion.div
          className="we-worlds-door we-on-shell"
          variants={m.variant('overlayEnter')}
          initial="hidden"
          animate="visible"
          transition={m.transition('enter')}
        >
          <div className="we-worlds-door__seam" aria-hidden="true" />
          <EmptyState
            className="we-worlds-door__content"
            icon={<MotionOrb size={56} />}
            title="暂无世界记录"
            hint="一个「世界」是一整套故事设定：背景、角色、这里什么是真的。"
            primaryAction={{ label: '新建世界', onClick: noop }}
            secondaryAction={{ label: '导入世界卡', onClick: noop }}
          />
        </motion.div>
      </div>
    </VisualSection>
  );
}

export function LoadingDemo() {
  return (
    <VisualSection id="loading">
      <div className="we-settings-loading" role="status" aria-label="设置加载中">
        <div className="we-settings-loading-scrim" aria-hidden="true" />
      </div>
    </VisualSection>
  );
}
