import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';

const MotionDiv = motion.div;

/**
 * 通用模态壳（各主题观感由 --we-* token 决定，见 themes/ui.css 的 we-modal / we-modal-backdrop）
 * - 蒙版：半透背景 + 微 blur，聚焦主体内容
 * - 容器：抬升表面 + 大圆角 + 接地投影，入场走 overlay 弹簧
 * - 无内置 padding，由子组件自行控制布局
 * - 容器自己裁掉溢出，动效包的装饰层（we-panel-edge）要画在容器外沿，
 *   所以放在外面一层入场壳里，与容器同大
 */
export default function ModalShell({ children, onClose, maxWidth = 'max-w-xl' }) {
  // 记录 mousedown 是否发生在背景本身（而非弹窗内容）
  const mouseDownOnBackdrop = useRef(false);
  const m = useMotion();
  useEscapeKey(onClose);

  return createPortal(
    <MotionDiv
      className="we-modal-backdrop fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center"
      variants={m.variant('overlayBackdrop')}
      initial="hidden"
      animate="visible"
      exit="hidden"
      transition={m.transition('backdrop')}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={() => { if (mouseDownOnBackdrop.current) onClose(); }}
    >
      <MotionDiv
        className={['relative w-full mx-4', maxWidth].join(' ')}
        variants={m.variant('overlayEnter')}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={m.transition('overlay')}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="we-modal we-material flex flex-col max-h-[90vh] overflow-hidden">
          {children}
        </div>
        <span className="we-panel-edge" aria-hidden="true" />
      </MotionDiv>
    </MotionDiv>,
    document.body
  );
}
