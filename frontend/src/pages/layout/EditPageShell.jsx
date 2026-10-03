import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Button from '../../components/ui/Button.jsx';
import ConfirmModal from '../../components/ui/ConfirmModal.jsx';
import Dialog from '../../components/ui/Dialog.jsx';
import Skeleton from '../../components/ui/Skeleton.jsx';
import SaveCapsule from './SaveCapsule.jsx';

/**
 * 世界 / 角色 / 玩家编辑页：从页面打开和直接访问地址都是一个 xl 宽的 Dialog，关闭后回到上一页。
 * loadError 非空时只显示错误与重试，不渲染表单：加载失败时表单是空值，误点保存会把空值写回。
 * dirty 为 true 时，关闭键、Esc 与点空白处先确认再关闭。
 * save 是保存栏的参数（见 SaveCapsule）：弹层里需要手动保存的字段共用正文底部这一个按钮。
 */
export default function EditPageShell({
  loading = false,
  loadError = '',
  onRetry,
  dirty = false,
  onClose,
  title,
  headerActions,
  save,
  children,
}) {
  const [confirmingClose, setConfirmingClose] = useState(false);
  const ready = !loading && !loadError;

  function requestClose() {
    if (dirty) setConfirmingClose(true);
    else onClose();
  }

  let body = <>{children}<SaveCapsule dirty={dirty} {...save} /></>;
  if (loadError) body = <p className="we-edit-empty-text">{loadError}</p>;
  else if (loading) body = <Skeleton className="w-64" />;

  return (
    <>
      <Dialog
        size="xl"
        title={title}
        headerActions={ready ? headerActions : undefined}
        bodyClassName="we-edit-body"
        footer={loadError ? <Button variant="secondary" onClick={onRetry}>重试</Button> : undefined}
        onClose={requestClose}
      >
        {body}
      </Dialog>
      <AnimatePresence>
        {confirmingClose && (
          <ConfirmModal
            title="放弃未保存的修改？"
            message="关闭后本次修改将丢失。"
            confirmText="放弃修改"
            cancelText="继续编辑"
            danger
            onConfirm={async () => onClose()}
            onClose={() => setConfirmingClose(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
