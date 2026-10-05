import { useSyncExternalStore } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { IconPlus, IconUpload } from '../../components/ui/icons.jsx';
import useStore from '../../core/state';
import ConfirmModal from '../../components/ui/ConfirmModal';
import EmptyState from '../../components/ui/EmptyState.jsx';
import Button from '../../components/ui/Button.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import ChangeText from '../../components/motion/ChangeText.jsx';
import MotionOrb from '../../components/motion/MotionOrb.jsx';
import { shatterCard } from '../../components/motion/shatter.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import { getPortal, startPortal, subscribePortal } from '../../core/motion/portal.js';
import { useWorldsPageController } from './useWorldsPageController.js';
import { useWorldAmbientTint } from './useWorldAmbientTint.js';
import WorldsGrid from './WorldsGrid.jsx';

export default function WorldsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentWorldId = useStore((state) => state.setCurrentWorldId);
  const motionConfig = useMotion();
  const sceneEnter = motionConfig.variant('overlayEnter');
  const page = useWorldsPageController();
  const { worlds, loading, loadError, deletingWorld, importingWorld, worldImportRef } = page;
  const { setLitWorld } = useWorldAmbientTint(worlds);
  // 进入世界的页面转场：转场期间旧页播退出动画并禁止二次点击
  const portal = useSyncExternalStore(subscribePortal, getPortal);

  // event 是点下（或回车）世界卡的事件：traits.shatter 的包把这张卡拆成碎块交给转场遮罩
  function handleEnterWorld(world, event) {
    setCurrentWorldId(world.id);
    const timing = motionConfig.portal();
    if (!timing) {
      navigate(`/worlds/${world.id}`);
      return;
    }
    const shards = motionConfig.pack.traits.shatter ? shatterCard(event.currentTarget, event) : null;
    startPortal({ worldId: world.id, shards });
    setTimeout(() => navigate(`/worlds/${world.id}`), timing.navigate * 1000);
  }

  return (
    <div className="we-worlds-canvas" data-portal={portal ? 'leave' : undefined}>
      <div className="we-worlds-header">
        <div className="we-worlds-heading">
          {worlds.length > 0 ? <p className="we-worlds-eyebrow"><ChangeText text={String(worlds.length)} playKey={worlds.length} decode /> 个世界</p> : null}
          <h1 className="we-worlds-title">世界</h1>
        </div>
        <div className="we-worlds-header-actions we-on-shell">
          <Button
            variant="ghost"
            onClick={() => worldImportRef.current?.click()}
            disabled={importingWorld}
          >
            <IconUpload size={16} />
            {importingWorld ? '导入中…' : '导入世界卡'}
          </Button>
          <input
            ref={worldImportRef}
            type="file"
            accept=".json,.weworld.json"
            className="hidden"
            onChange={page.handleImportWorldFile}
          />
          <Button
            variant="ghost"
            className="we-worlds-header-btn--create"
            onClick={() => navigate('/worlds/new', { state: { backgroundLocation: location } })}
          >
            <IconPlus size={16} />
            创建世界
          </Button>
        </div>
      </div>

      {loading && worlds.length === 0 ? (
        <div className="we-worlds-grid" role="status" aria-label="加载中">
          {Array.from({ length: 5 }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className={`we-world-card-shell${index === 0 ? ' we-world-card-shell--feature' : ''}`}
            >
              <Skeleton block />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="we-worlds-state we-on-shell">
          <EmptyState
            title="世界列表读取失败"
            hint={loadError}
            primaryAction={{ label: '重试', onClick: page.loadWorlds }}
          />
        </div>
      ) : worlds.length === 0 ? (
        <motion.div
          className="we-worlds-door we-on-shell"
          variants={sceneEnter}
          initial="hidden"
          animate="visible"
          transition={motionConfig.transition('enter')}
        >
          <div className="we-worlds-door__seam" aria-hidden="true" />
          <EmptyState
            className="we-worlds-door__content"
            icon={<MotionOrb size={56} />}
            title="暂无世界记录"
            hint="一个「世界」是一整套故事设定：背景、角色、这里什么是真的。建好之后你可以在里面对话或写故事，AI 全程按这套设定来。如果手头已经有别人做好的世界卡，也可以直接导入，不用从零开始写。"
            primaryAction={{ label: '新建世界', onClick: () => navigate('/worlds/new', { state: { backgroundLocation: location } }) }}
            secondaryAction={{ label: '导入世界卡', onClick: () => worldImportRef.current?.click() }}
          />
        </motion.div>
      ) : (
        <WorldsGrid
          worlds={worlds}
          onReorderEnd={page.handleReorderEnd}
          actionsOpenId={page.actionsOpenId}
          setActionsOpenId={page.setActionsOpenId}
          setDeletingWorld={page.setDeletingWorld}
          exportingWorldId={page.exportingWorldId}
          reloadKey={page.reloadKey}
          handleExportWorld={page.handleExportWorld}
          handleEnterWorld={handleEnterWorld}
          portalWorldId={portal?.worldId}
          setLitWorld={setLitWorld}
        />
      )}

      <AnimatePresence>
        {deletingWorld && (
          <ConfirmModal
            title="确认删除"
            message={(
              <>
                <p className="we-confirm-msg-line">
                  即将删除世界 <span className="we-confirm-msg-name">「{deletingWorld.name}」</span>。
                </p>
                <p className="we-confirm-msg-danger">
                  此操作将同时删除其下所有角色和故事线，且无法恢复。
                </p>
              </>
            )}
            confirmText="确认删除"
            danger
            onConfirm={page.handleDelete}
            onClose={() => page.setDeletingWorld(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
