import { ConfirmModal } from '../../../components';

// ── 删除角色 / 删除玩家卡确认弹窗 ────────────────────────────────────────────

export function DeleteConfirmModals({
  deletingChar,
  onCloseDeletingChar,
  onConfirmDeleteChar,
  deletingPersona,
  onCloseDeletingPersona,
  onConfirmDeletePersona,
}) {
  return (
    <>
      {/* 删除角色确认 */}
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

      {/* 删除玩家卡确认 */}
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
    </>
  );
}
