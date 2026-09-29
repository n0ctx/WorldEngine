import { motion } from 'framer-motion';
import DeleteButton from '../../../components/motion/DeleteButton.jsx';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import PanelCard from '../../../components/ui/PanelCard.jsx';
import { useMotion } from '../../../core/hooks/useMotion.js';
import Compare from '../sketch/Compare.jsx';
import Touch from '../sketch/Touch.jsx';
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
      </div>
    </SlotSection>
  );
}

export function PortalDemo() {
  const m = useMotion();
  return (
    <SlotSection id="portal">
      <motion.button type="button" className="we-design-lab__card we-material" {...m.gesture('portal')}>进入世界</motion.button>
    </SlotSection>
  );
}

export function SinkDemo() {
  const m = useMotion();
  return (
    <SlotSection id="sink">
      <motion.button type="button" className="we-design-lab__send" aria-label="发送" {...m.gesture('sink')}>↑</motion.button>
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
      <Compare sketchClass="we-sketch-card">
        <div className="we-design-lab__row">
          {['contained', 'ring', 'whisper'].map((elevation) => (
            <Touch key={elevation}>
              <Card elevation={elevation} className="we-design-lab__card-sample">{elevation}</Card>
            </Touch>
          ))}
        </div>
        <Touch>
          <PanelCard title="面板卡片" actions={<Button variant="ghost" size="sm">操作</Button>}>
            <p className="we-design-lab__note">悬停整块面板。</p>
          </PanelCard>
        </Touch>
      </Compare>
    </SlotSection>
  );
}
