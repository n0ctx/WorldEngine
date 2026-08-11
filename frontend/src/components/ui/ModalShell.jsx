import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { DURATION, EASE } from '../../core/utils/motion.js';

const MotionDiv = motion.div;

/**
 * 通用模态壳（各主题观感由 --we-* token 决定，见 themes/ui.css 的 we-modal / we-modal-backdrop）
 * - 蒙版：半透背景 + 微 blur，聚焦主体内容
 * - 容器：底色 + 顶部强调细线 + 阴影，体现悬浮层级
 * - 无内置 padding，由子组件自行控制布局
 */
export default function ModalShell({ children, onClose, maxWidth = 'max-w-xl' }) {
  // 记录 mousedown 是否发生在背景本身（而非弹窗内容）
  const mouseDownOnBackdrop = useRef(false);

  return createPortal(
    <MotionDiv
      className="we-modal-backdrop fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{   opacity: 0 }}
      transition={{ duration: DURATION.quick, ease: EASE.sharp }}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={() => { if (mouseDownOnBackdrop.current) onClose(); }}
    >
      <MotionDiv
        className={[
          'we-modal w-full mx-4 flex flex-col max-h-[90vh] overflow-hidden',
          maxWidth,
        ].join(' ')}
        initial={{ opacity: 0, y: 8,  scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={{   opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: DURATION.base, ease: EASE.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </MotionDiv>
    </MotionDiv>,
    document.body
  );
}
