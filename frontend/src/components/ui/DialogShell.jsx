import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';

// portal 出 SettingsPage 后 React 事件仍沿 React 树冒泡，overlay 必须 stopPropagation，
// 否则 `.we-settings-overlay` 的"mousedown+mouseup 都在面板外 → navigate(-1)"会把模态点击当作点面板外，连同设置页一起关掉。
// 关闭语义用 mousedown-起点-在-overlay 双段判定，防止模态内拖选文字到背景松手误关。
// 遮罩与面板的入场由动效包决定：遮罩走 --we-fx-scrim（themes/ui.css），面板走 overlayEnter；
// 面板里的 we-panel-edge 是动效包画锁定括号等装饰的一层，默认不显示
export default function DialogShell({ children, onClose, panelClassName = 'w-full max-w-lg max-h-[90vh] flex flex-col' }) {
  const mouseDownOnOverlay = useRef(false);
  const m = useMotion();
  useEscapeKey(onClose);

  return createPortal(
    <div
      className="we-dialog-overlay"
      onMouseDown={(e) => {
        mouseDownOnOverlay.current = e.target === e.currentTarget;
        e.stopPropagation();
      }}
      onMouseUp={(e) => { e.stopPropagation(); }}
      onClick={(e) => {
        e.stopPropagation();
        if (mouseDownOnOverlay.current && e.target === e.currentTarget) onClose();
        mouseDownOnOverlay.current = false;
      }}
    >
      <motion.div
        className={`we-dialog-panel we-material ${panelClassName}`}
        variants={m.variant('overlayEnter')}
        initial="hidden"
        animate="visible"
        transition={m.transition('overlay')}
      >
        <span className="we-panel-edge" aria-hidden="true" />
        {children}
      </motion.div>
    </div>,
    document.body
  );
}
