import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Upload } from 'lucide-react';
import useStore from '../core/state/index';
import ConfirmModal from '../components/ui/ConfirmModal';
import EmptyState from '../components/ui/EmptyState.jsx';
import Button from '../components/ui/Button.jsx';
import AnimatedCounter from '../components/motion/AnimatedCounter.jsx';
import FluidOrb from '../components/motion/FluidOrb.jsx';
import { useMotion } from '../core/hooks/useMotion.js';
import { useWorldsPageController } from './WorldsPage/useWorldsPageController.js';
import { useWorldAmbientTint } from './WorldsPage/useWorldAmbientTint.js';
import WorldsGrid from './WorldsPage/WorldsGrid.jsx';

export default function WorldsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentWorldId = useStore((state) => state.setCurrentWorldId);
  const motionConfig = useMotion();
  const sceneEnter = motionConfig.variant('sceneEnter');
  const page = useWorldsPageController();
  const { worlds, loading, loadError, deletingWorld, importingWorld, worldImportRef } = page;
  const { setLitWorld } = useWorldAmbientTint(worlds);

  function handleEnterWorld(world) {
    setCurrentWorldId(world.id);
    navigate(`/worlds/${world.id}`);
  }

  return (
    <div className="we-worlds-canvas">
      <div className="we-worlds-header">
        <div className="we-worlds-heading">
          {worlds.length > 0 ? <p className="we-worlds-eyebrow"><AnimatedCounter value={worlds.length} /> 个世界</p> : null}
          <h1 className="we-worlds-title">世界</h1>
        </div>
        <div className="we-worlds-header-actions">
          <Button
            variant="ghost"
            className="we-worlds-header-btn"
            onClick={() => worldImportRef.current?.click()}
            disabled={importingWorld}
          >
            <Upload size={16} />
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
            className="we-worlds-header-btn we-worlds-header-btn--create"
            onClick={() => navigate('/worlds/new', { state: { backgroundLocation: location } })}
          >
            <Plus size={16} />
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
              <div className="we-skeleton-block we-skeleton-block--card" />
            </div>
          ))}
        </div>
      ) : loadError ? (
        <div className="we-worlds-state">
          <EmptyState
            title="世界列表读取失败"
            hint={loadError}
            primaryAction={{ label: '重试', onClick: page.loadWorlds }}
          />
        </div>
      ) : worlds.length === 0 ? (
        <motion.div
          className="we-worlds-door"
          variants={sceneEnter}
          initial="hidden"
          animate="visible"
          transition={motionConfig.spring('portal')}
        >
          <div className="we-worlds-door__seam" aria-hidden="true" />
          <EmptyState
            className="we-worlds-door__content"
            icon={<FluidOrb size={56} />}
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
          setLitWorld={setLitWorld}
        />
      )}

      {deletingWorld && (
        <ConfirmModal
          title="确认删除"
          message={(
            <>
              <p className="we-confirm-msg-line">
                即将删除世界 <span className="we-confirm-msg-name">「{deletingWorld.name}」</span>。
              </p>
              <p className="we-confirm-msg-danger">
                此操作将同时删除其下所有角色和会话，且无法恢复。
              </p>
            </>
          )}
          confirmText="确认删除"
          danger
          onConfirm={page.handleDelete}
          onClose={() => page.setDeletingWorld(null)}
        />
      )}
    </div>
  );
}
