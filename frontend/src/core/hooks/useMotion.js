import { useReducedMotion } from 'framer-motion';
import { transitions as motionTransitions } from '../utils/motion.js';

export function useMotion() {
  const systemReduced = useReducedMotion();
  const reduced = !!systemReduced;

  return {
    reduced,
    duration: (d) => (reduced ? 0 : d),
    ease:     (e) => (reduced ? 'linear' : e),
    blur:     (b) => (reduced ? '0px' : b),
    // 接受 transitions 预设 key，reduced 模式下 duration → 0
    transition: (preset) => {
      const t = motionTransitions[preset] ?? motionTransitions.ink;
      return reduced ? { ...t, duration: 0 } : t;
    },
  };
}
