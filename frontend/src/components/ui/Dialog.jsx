import { useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { useMotion } from '../../core/hooks/useMotion.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import { useFocusTrap } from '../../core/hooks/useFocusTrap.js';
import IconButton from './IconButton.jsx';

const MotionDiv = motion.div;

/**
 * 全站唯一的弹窗：挂到 body，遮罩 + 玻璃面板，入场与退场走动效包（退场需要调用方用 AnimatePresence 包住条件渲染）。
 * - 版式：标准（页头标题、说明、右上角关闭键；正文可滚动；页脚按钮靠右）；alert 为确认版式，没有关闭键和正文区。
 * - headerActions 放在页头关闭键左边，用于针对整个弹窗对象的操作（如导出）。
 * - 宽度 size：sm 确认与小选择 / md 表单 / lg 编辑器与向导 / xl 多栏浏览。
 * - Esc、点空白处、关闭键都调用 onClose；busy 时三者都不生效。焦点圈在弹窗里，关闭后还给打开它的元素。
 * - 传 onSubmit 时页头到页脚包进一个表单，页脚里 type="submit" 的按钮提交。
 * - 嵌套弹窗直接再渲染一个 Dialog，后挂载的叠在上面。
 * - continued：这个弹窗接替同一流程里的上一个（向导换步）；遮罩和面板不再重播入场，只有正文按前进方向翻进来。
 * - 弹窗里的鼠标事件不再沿 React 树冒泡到外层（设置页遮罩按「按下松开都在面板外」判断关闭）。
 */
export default function Dialog({
  size = 'md',
  alert = false,
  title,
  description,
  headerActions,
  footer,
  footerStart,
  busy = false,
  onClose,
  onSubmit,
  bodyClassName = '',
  continued = false,
  children,
}) {
  const m = useMotion();
  const panelRef = useRef(null);
  const downOnBackdrop = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const onTab = useFocusTrap(panelRef);
  const close = () => { if (!busy) onClose(); };
  useEscapeKey(close);

  const parts = (
    <>
      <header className="we-dialog__header">
        <div className="we-dialog__heading">
          <h2 id={titleId} className="we-dialog__title">{title}</h2>
          {description && <div id={descriptionId} className="we-dialog__description">{description}</div>}
        </div>
        {headerActions && <div className="we-dialog__header-actions">{headerActions}</div>}
        {!alert && (
          <IconButton size="sm" label="关闭" className="we-dialog__close" onClick={close} disabled={busy}>
            <X size={16} />
          </IconButton>
        )}
      </header>
      {children && (
        <MotionDiv
          className={['we-dialog__body', bodyClassName].filter(Boolean).join(' ')}
          {...(continued && { custom: 1, variants: m.variant('tabEnter'), initial: 'hidden', animate: 'visible', transition: m.transition('overlay') })}
        >
          {children}
        </MotionDiv>
      )}
      {footer && (
        <footer className="we-dialog__footer">
          {footerStart && <div className="we-dialog__footer-start">{footerStart}</div>}
          {footer}
        </footer>
      )}
    </>
  );

  return createPortal(
    <MotionDiv
      className="we-dialog-backdrop"
      variants={m.variant('overlayBackdrop')}
      initial={continued ? false : 'hidden'}
      animate="visible"
      exit="hidden"
      transition={m.transition('backdrop')}
      onMouseDown={(e) => {
        downOnBackdrop.current = e.target === e.currentTarget;
        e.stopPropagation();
      }}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (downOnBackdrop.current && e.target === e.currentTarget) close();
        downOnBackdrop.current = false;
      }}
    >
      <MotionDiv
        ref={panelRef}
        className={`we-dialog we-material we-dialog--${size}${alert ? ' we-dialog--alert' : ''}`}
        role={alert ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        onKeyDown={onTab}
        variants={m.variant('overlayEnter')}
        initial={continued ? false : 'hidden'}
        animate="visible"
        exit="exit"
        transition={m.transition('overlay')}
      >
        <span className="we-panel-edge" aria-hidden="true" />
        {onSubmit ? <form className="we-dialog__form" onSubmit={onSubmit}>{parts}</form> : parts}
      </MotionDiv>
    </MotionDiv>,
    document.body,
  );
}
