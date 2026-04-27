import { useRef } from 'react';
import { motion } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion.js';

const MotionDiv = motion.div;

/**
 * 羊皮纸模态壳 — DESIGN §7.8
 * - 蒙版：深棕半透 + 微blur，营造"灯光聚焦"感
 * - 容器：paper-base 底色，顶部陶土细线，多层阴影体现悬浮质感
 * - 无内置 padding，由子组件自行控制布局
 */
export default function ModalShell({ children, onClose, maxWidth = 'max-w-lg' }) {
  // 记录 mousedown 是否发生在背景本身（而非弹窗内容）
  const mouseDownOnBackdrop = useRef(false);

  return (
    <MotionDiv
      className="we-modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
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
    </MotionDiv>
  );
}
