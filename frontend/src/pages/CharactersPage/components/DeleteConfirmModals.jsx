import { AnimatePresence } from 'framer-motion';
import { ConfirmModal } from '../../../components';

// ── 删除角色 / 删除玩家卡 / 删除故事线确认弹窗 ────────────────────────────────────────────

export function DeleteConfirmModals({
  deletingChar,
  onCloseDeletingChar,
  onConfirmDeleteChar,
  deletingPersona,
  onCloseDeletingPersona,
  onConfirmDeletePersona,
  deletingStoryline,
  deletingStorylineTitle,
  onCloseDeletingStoryline,
  onConfirmDeleteStoryline,
}) {
  return (
    <>
      {/* 删除角色确认 */}
      <AnimatePresence>
        {deletingChar && (
          <ConfirmModal
            title="确认删除"
            message={
              <>
                <p className="we-confirm-msg-line">
                  即将删除角色 <span className="we-confirm-msg-name">「{deletingChar.name}」</span>。
                </p>
                <p className="we-confirm-msg-danger">
                  此操作将同时删除该角色的所有会话记录，且无法恢复。
                </p>
              </>
            }
            confirmText="确认删除"
            danger
            onConfirm={onConfirmDeleteChar}
            onClose={onCloseDeletingChar}
          />
        )}
      </AnimatePresence>

      {/* 删除玩家卡确认 */}
      <AnimatePresence>
        {deletingPersona && (
          <ConfirmModal
            title="确认删除"
            message={
              <>
                <p className="we-confirm-msg-line">
                  即将删除玩家卡 <span className="we-confirm-msg-name">「{deletingPersona.name || '（未命名玩家）'}」</span>。
                </p>
                <p className="we-confirm-msg-danger">
                  此操作无法恢复。
                </p>
              </>
            }
            confirmText="确认删除"
            danger
            onConfirm={onConfirmDeletePersona}
            onClose={onCloseDeletingPersona}
          />
        )}
      </AnimatePresence>

      {/* 删除故事线确认 */}
      <AnimatePresence>
        {deletingStoryline && (
          <ConfirmModal
            title="确认删除"
            message={
              <>
                <p className="we-confirm-msg-line">
                  即将删除故事线 <span className="we-confirm-msg-name">「{deletingStorylineTitle}」</span>。
                </p>
                <p className="we-confirm-msg-danger">
                  此操作将同时删除其中的所有消息，且无法恢复。
                </p>
              </>
            }
            confirmText="确认删除"
            danger
            onConfirm={onConfirmDeleteStoryline}
            onClose={onCloseDeletingStoryline}
          />
        )}
      </AnimatePresence>
    </>
  );
}
