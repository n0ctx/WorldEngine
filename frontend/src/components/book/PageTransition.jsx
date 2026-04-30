import { AnimatePresence, motion } from 'framer-motion';
import { variants } from '../../utils/motion.js';

const MotionDiv = motion.div;

/**
 * 路由级过渡容器。locationKey 变化时触发 pageTransition 动效；
 * overlay 场景（backgroundLocation 激活时 locationKey 不变）不触发。
 */
export default function PageTransition({ children, locationKey }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <MotionDiv
        key={locationKey}
        variants={variants.pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </MotionDiv>
    </AnimatePresence>
  );
}
