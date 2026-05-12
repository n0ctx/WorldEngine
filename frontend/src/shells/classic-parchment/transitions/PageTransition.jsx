import { AnimatePresence, motion } from 'framer-motion';
import { variants } from '../../../utils/motion.js';

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
 * Route-level transition container for the classic-parchment shell.
 * locationKey changes trigger pageTransition motion; overlay routes
 * (backgroundLocation active → locationKey unchanged) do not.
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
