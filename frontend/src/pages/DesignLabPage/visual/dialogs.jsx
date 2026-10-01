import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Button from '../../../components/ui/Button.jsx';
import ConfirmModal from '../../../components/ui/ConfirmModal.jsx';
import Dialog from '../../../components/ui/Dialog.jsx';
import Select from '../../../components/ui/Select.jsx';
import StepTrack from '../../../components/motion/StepTrack.jsx';
import VisualSection from '../VisualSection.jsx';
import { SELECT_OPTIONS } from '../demos/fixtures.js';

const SUMMARY = '雨从傍晚一直下到后半夜。沈彦在拳场认出了你，台下有人低声报出一个数字。'.repeat(6);

export function DialogsDemo() {
  const [open, setOpen] = useState(null);
  const [discard, setDiscard] = useState(false);
  const [choice, setChoice] = useState('a');
  const close = () => setOpen(null);
  return (
    <VisualSection
      id="dialogs"
      actions={(
        <div className="we-design-lab__row">
          <Button size="sm" variant="secondary" onClick={() => setOpen('alert')}>确认版式</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen('form')}>标准 · 中（含下拉、嵌套确认）</Button>
          <Button size="sm" variant="secondary" onClick={() => setOpen('long')}>标准 · 大（长内容、页脚左侧）</Button>
        </div>
      )}
    >
      <p className="we-design-lab__note">
        标准版式页头放标题、说明和关闭键，页脚按钮靠右；确认版式只有标题、说明和按钮。Tab 只在弹窗里循环，关闭后焦点回到打开它的按钮；
        下拉打开时 Esc 先收起下拉；嵌套弹窗直接叠在上面。
      </p>
      <AnimatePresence>
        {open === 'alert' && (
          <ConfirmModal
            title="删除这条消息？"
            message="删除后，后面的剧情会从上一条继续。"
            confirmText="删除"
            danger
            onConfirm={() => new Promise((resolve) => { setTimeout(() => { resolve(); close(); }, 1200); })} // guard-allow(literals): 实验室里模拟处理中
            onClose={close}
          />
        )}
        {open === 'form' && (
          <Dialog
            title="编辑正则规则"
            description="匹配到的文字会在显示前替换。"
            onClose={() => setDiscard(true)}
            footer={(
              <>
                <Button variant="ghost" onClick={() => setDiscard(true)}>取消</Button>
                <Button onClick={close}>保存</Button>
              </>
            )}
          >
            <div className="we-design-lab__grid">
              <Select value={choice} onChange={setChoice} options={SELECT_OPTIONS} />
            </div>
          </Dialog>
        )}
        {open === 'long' && (
          <Dialog
            size="lg"
            title="剧情摘要"
            description="已覆盖到第 8 轮"
            onClose={close}
            footerStart={<StepTrack steps={3} current={1} />}
            footer={(
              <>
                <Button variant="ghost" onClick={close}>取消</Button>
                <Button onClick={close}>保存</Button>
              </>
            )}
          >
            {Array.from({ length: 8 }, (_, i) => <p key={i} className="we-design-lab__prose">{SUMMARY}</p>)}
          </Dialog>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {discard && (
          <ConfirmModal
            title="放弃未保存的修改？"
            message="关闭后本次修改将丢失。"
            confirmText="放弃"
            cancelText="继续编辑"
            danger
            onConfirm={async () => { setDiscard(false); close(); }}
            onClose={() => setDiscard(false)}
          />
        )}
      </AnimatePresence>
    </VisualSection>
  );
}
