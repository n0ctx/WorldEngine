import { motion } from 'framer-motion';
import { ArrowUp, PencilLine, Trash2 } from 'lucide-react';
import DeleteButton from '../../../components/motion/DeleteButton.jsx';
import { useTouchFx } from '../../../components/motion/useTouchFx.jsx';
import Button from '../../../components/ui/Button.jsx';
import IconButton from '../../../components/ui/IconButton.jsx';
import Card from '../../../components/ui/Card.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import SlotSection from '../SlotSection.jsx';

const noop = () => {};

export function PressDemo() {
  return (
    <SlotSection id="press">
      <div className="we-design-lab__row">
        <Button>继续写</Button>
        <Button variant="secondary">存为草稿</Button>
        <Button variant="ghost">幽灵按钮</Button>
        <Button variant="danger">危险操作</Button>
        <IconButton size="sm" label="编辑"><PencilLine size={16} /></IconButton>
        <IconButton size="sm" variant="danger" label="删除"><Trash2 size={16} /></IconButton>
      </div>
    </SlotSection>
  );
}

// 入口卡片的真身是世界卡（带封面、拖动），这里只借它的类名和手势，样子一样
export function PortalDemo() {
  const m = useMotion();
  const touch = useTouchFx();
  return (
    <SlotSection id="portal">
      <div className="we-design-lab__row">
        <div className="we-world-card-shell we-design-lab__portal">
          <motion.button type="button" className="we-world-card we-material" {...m.gesture('portal')} {...touch.handlers}>
            {touch.fx}
            <span className="we-world-card-foot"><span className="we-world-card-name">进入世界</span></span>
          </motion.button>
        </div>
      </div>
    </SlotSection>
  );
}

// 发送键与输入框里的同一份：主要色调的中号图标按钮，按压换成「下沉」手势
export function SinkDemo() {
  const m = useMotion();
  return (
    <SlotSection id="sink">
      <IconButton variant="primary" label="发送" className="we-chat-send-btn" {...m.gesture('sink')}>
        <ArrowUp size={20} strokeWidth={2} />
      </IconButton>
    </SlotSection>
  );
}

export function DeleteButtonDemo() {
  return (
    <SlotSection id="delete-button">
      <DeleteButton label="删除这条规则" onConfirm={noop} />
    </SlotSection>
  );
}

export function CardHoverDemo() {
  return (
    <SlotSection id="card-hover">
      <div className="we-design-lab__row">
        {['contained', 'ring', 'whisper'].map((elevation) => (
          <Card key={elevation} elevation={elevation} className="we-design-lab__card-sample">{elevation}</Card>
        ))}
      </div>
    </SlotSection>
  );
}
