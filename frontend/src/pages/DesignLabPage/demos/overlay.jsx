import { useEffect, useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Button from '../../../components/ui/Button.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import Dialog from '../../../components/ui/Dialog.jsx';
import FormGroup from '../../../components/ui/FormGroup.jsx';
import Input from '../../../components/ui/Input.jsx';
import Textarea from '../../../components/ui/Textarea.jsx';
import SaveCapsule from '../../layout/SaveCapsule.jsx';
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
      <AnimatePresence>
        {open && (
          <Dialog
            title="编辑正则规则"
            description="点空白处、按 Esc 或右上角关闭。"
            onClose={() => setOpen(false)}
            footer={(
              <>
                <Button variant="ghost" onClick={() => setOpen(false)}>取消</Button>
                <Button onClick={() => setOpen(false)}>保存</Button>
              </>
            )}
          >
            对话面板的内容。
          </Dialog>
        )}
      </AnimatePresence>
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

const CAPSULE_FORM = { name: '群星海', description: '星门之后是无数被遗忘的殖民地。', temperature: '0.9', maxTokens: '' };
const CAPSULE_SAVE_MS = 700;

function CapsuleSample({ failNext, creating }) {
  const [saved, setSaved] = useState(CAPSULE_FORM);
  const [form, setForm] = useState(CAPSULE_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedKey, setSavedKey] = useState(0);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  const dirty = Object.keys(form).some((key) => form[key] !== saved[key]);
  const field = (key) => ({ value: form[key], onChange: (e) => setForm((prev) => ({ ...prev, [key]: e.target.value })) });

  function save() {
    setSaving(true);
    setError('');
    timer.current = setTimeout(() => {
      setSaving(false);
      if (failNext) { setError('网络中断'); return; }
      setSaved(form);
      setSavedKey((n) => n + 1);
    }, CAPSULE_SAVE_MS);
  }

  return (
    <div className="we-design-lab__capsule-frame">
      <div className="we-edit-form-stack">
        <FormGroup label="名称" required><Input {...field('name')} placeholder="世界的名称" /></FormGroup>
        <FormGroup label="简介"><Textarea rows={3} {...field('description')} placeholder="一句话介绍这个世界…" /></FormGroup>
        <FormGroup label="Temperature"><Input type="number" {...field('temperature')} placeholder="留空则使用全局配置" /></FormGroup>
        <FormGroup label="最大 Token 数"><Input type="number" {...field('maxTokens')} placeholder="留空则使用全局配置" /></FormGroup>
      </div>
      <SaveCapsule
        creating={creating}
        dirty={dirty}
        saving={saving}
        error={error}
        savedKey={savedKey}
        saveLabel={creating ? '创建世界' : '保存'}
        onSave={save}
      />
    </div>
  );
}

export function SaveCapsuleDemo() {
  const [failNext, setFailNext] = useState(false);
  const [creating, setCreating] = useState(false);
  return (
    <SlotSection
      id="save-capsule"
      actions={(
        <>
          <Button variant="secondary" size="sm" aria-pressed={failNext} onClick={() => setFailNext((v) => !v)}>下次保存失败</Button>
          <Button variant="secondary" size="sm" aria-pressed={creating} onClick={() => setCreating((v) => !v)}>新建形态</Button>
        </>
      )}
    >
      <p className="we-design-lab__note">改任意一项，胶囊从底部浮起；保存后「已保存」停一拍再收起。</p>
      <CapsuleSample key={creating ? 'create' : 'edit'} failNext={failNext} creating={creating} />
    </SlotSection>
  );
}
