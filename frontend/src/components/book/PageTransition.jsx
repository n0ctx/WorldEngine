import { AnimatePresence, motion } from 'framer-motion';
import { variants, transitions } from '../../utils/motion.js';

export default function PageTransition({ children, locationKey }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={locationKey}
        style={{
          flex: 1,
          minHeight: 0,
          overflowX: 'hidden',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
        variants={variants.pageTransition}
        initial="hidden"
        animate="visible"
        exit="exit"
        transition={transitions.page}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
