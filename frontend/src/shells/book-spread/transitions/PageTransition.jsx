import { AnimatePresence, motion } from 'framer-motion';
import { variants } from '../../../core/utils/motion.js';

const MotionDiv = motion.div;

/**
 * ENABLED=false 是有意为之，勿轻易翻开。
 *
 * 本应用的"翻页"语义已由页内 Pager 切片机制承担（MessageList 按页切片，不是滚动），
 * 路由级过渡会与之叠加，造成切页时双重位移 / 闪烁。重新启用前必须在隔离分支验证：
 * 与 Pager 切片、book-spread 双页布局无双挂载、无滚动跳变。
 * 背景与判定见本注释：路由级动效会和页内 Pager 切片叠加。
 */
const ENABLED = false;

/**
 * Route-level transition container for the book-spread shell.
 * locationKey changes trigger pageTransition motion; overlay routes
 * (backgroundLocation active → locationKey unchanged) do not.
 */
export default function PageTransition({ children, locationKey }) {
  if (!ENABLED) {
    return <div className="we-page-transition">{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <MotionDiv
        key={locationKey}
        className="we-page-transition"
        variants={variants.pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {children}
      </MotionDiv>
    </AnimatePresence>
  );
}
