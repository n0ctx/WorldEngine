import { AnimatePresence, motion } from 'framer-motion';
import { variants } from '../../../core/utils/motion.js';

const MotionDiv = motion.div;

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
