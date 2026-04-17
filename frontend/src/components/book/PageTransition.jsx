import { motion } from 'framer-motion';
import { useLocation } from 'react-router-dom';
import { MOTION } from '../../utils/motion.js';

/**
 * 路由进入动画 — 无退出动画，避免任何闪烁感
 * 旧页瞬间消失，新页内容从下方轻轻浮起落定
 * key 变化触发组件重挂载，initial→animate 执行一次
 */
export default function PageTransition({ children }) {
  const location = useLocation();
  return (
    <motion.div
      key={location.pathname}
      initial={{ y: 8 }}
      animate={{ y: 0 }}
      transition={{ duration: 1, ease: MOTION.ease.ink }}
      style={{
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {children}
    </motion.div>
  );
}
