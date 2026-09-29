import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Button from '../../../components/ui/Button.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import DialogShell from '../../../components/ui/DialogShell.jsx';
import { log } from '../../../core/utils/logger.js';
import SlotSection from '../SlotSection.jsx';
import { TOASTS } from './fixtures.js';

export function ModalDemo() {
  const [open, setOpen] = useState(false);
  return (
    <SlotSection
      id="modal"
      actions={<Button variant="secondary" size="sm" onClick={() => setOpen(true)}>打开弹窗</Button>}
    >
      <AnimatePresence>
        {open && (
          <ConfirmModal
            title="删除这条消息？"
            message="删除后，后面的剧情会从上一条继续。"
            confirmText="删除"
            danger
            onConfirm={() => setOpen(false)}
            onClose={() => setOpen(false)}
          />
        )}
      </AnimatePresence>
    </SlotSection>
  );
}

export function DialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <SlotSection
      id="dialog"
      actions={<Button variant="secondary" size="sm" onClick={() => setOpen(true)}>打开对话面板</Button>}
    >
      {open && (
        <DialogShell onClose={() => setOpen(false)}>
          <div className="we-design-lab__dialog-body">
            <p>对话面板的内容。点空白处关闭。</p>
            <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>关闭</Button>
          </div>
        </DialogShell>
      )}
    </SlotSection>
  );
}

export function ToastDemo() {
  const [index, setIndex] = useState(0);
  function send() {
    log.success('design-lab.toast', null, { toast: TOASTS[index % TOASTS.length] });
    setIndex((i) => i + 1);
  }
  return (
    <SlotSection
      id="toast"
      actions={<Button variant="secondary" size="sm" onClick={send}>发送成功提示</Button>}
    />
  );
}
