import { motion } from 'framer-motion';
import { DURATION, EASE } from '../../utils/motion.js';

/**
 * 羊皮纸模态壳 — DESIGN §7.8
 * - 蒙版：深棕半透 + 微blur，营造"灯光聚焦"感
 * - 容器：paper-base 底色，顶部陶土细线，多层阴影体现悬浮质感
 * - 无内置 padding，由子组件自行控制布局
 */
export default function ModalShell({ children, onClose, maxWidth = 'max-w-lg' }) {
  return (
    <motion.div
      className="we-modal-backdrop fixed inset-0 z-50 flex items-center justify-center"
      style={{
        background: 'var(--we-color-bg-overlay)',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{   opacity: 0 }}
      transition={{ duration: DURATION.quick, ease: EASE.sharp }}
      onClick={onClose}
    >
      <motion.div
        className={[
          'we-modal w-full mx-4 flex flex-col max-h-[90vh] overflow-hidden',
          maxWidth,
        ].join(' ')}
        style={{
          background: 'var(--we-paper-base)',
          /* 顶部装饰线：陶土/金色强调 */
          borderTop: '2px solid var(--we-accent)',
          borderRight:  '1px solid var(--we-border)',
          borderBottom: '1px solid var(--we-border)',
          borderLeft:   '1px solid var(--we-border)',
          borderRadius: 'var(--we-radius-sm, 8px)',
          /* 三层阴影：轮廓线 + 中距扩散 + 远焦羊皮纸投影 */
          boxShadow: 'var(--we-shadow-paper-stack)',
        }}
        initial={{ opacity: 0, y: 8,  scale: 0.96 }}
        animate={{ opacity: 1, y: 0,  scale: 1    }}
        exit={{   opacity: 0, y: -8, scale: 0.96 }}
        transition={{ duration: DURATION.base, ease: EASE.ink }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </motion.div>
    </motion.div>
  );
}
