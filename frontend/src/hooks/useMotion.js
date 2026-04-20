import { useReducedMotion } from 'framer-motion';

/**
 * 无障碍减弱动效检测（MOTION.md §10.1）
 * 当前只检测系统偏好；用户级开关待后续在 displaySettings store
 * 添加 reduceMotion 字段后接入。
 */
export function useMotion() {
  const systemReduced = useReducedMotion();
  const reduced = !!systemReduced;

  return {
    reduced,
    duration: (d) => (reduced ? 0 : d),
    ease:     (e) => (reduced ? 'linear' : e),
    blur:     (b) => (reduced ? '0px' : b),
  };
}
