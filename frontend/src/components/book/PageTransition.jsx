import { AnimatePresence, motion } from 'framer-motion';
import { variants } from '../../utils/motion.js';

const MotionDiv = motion.div;

const ENABLED = false;

const containerStyle = {
  flex: 1,
  minHeight: 0,
  overflowX: 'hidden',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
};

/**
 * 路由级过渡容器。locationKey 变化时触发 pageTransition 动效；
 * overlay 场景（backgroundLocation 激活时 locationKey 不变）不触发。
 */
export default function PageTransition({ children, locationKey }) {
  if (!ENABLED) {
    return <div style={containerStyle}>{children}</div>;
  }

  return (
    <AnimatePresence mode="wait" initial={false}>
      <MotionDiv
        key={locationKey}
        variants={variants.pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={containerStyle}
      >
        {children}
      </MotionDiv>
    </AnimatePresence>
  );
}
