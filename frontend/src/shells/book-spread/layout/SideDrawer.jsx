/* 两侧抽屉：窄轨 + 唤出内容。
 *
 * 结构性的收起/展开属于 shell 的职责：本组件只负责「窄轨图标按钮 + 宽度过渡 +
 * 记忆展开态」的机制本身，不关心轨里装的是什么（会话列表、状态面板…）——那部分
 * 内容仍由页面通过 PageLayout 的 left/right 插槽提供，本组件只是把它包起来。
 *
 * 采用「推开正文」而非浮层：left/right 抽屉本来就是 book-spread 行内的 flex 兄弟节点
 * （不是叠在正文之上的独立层），展开时让正文（we-page-right 的 flex-1）自然让出空间，
 * 比额外引入一层遮挡正文的浮层更简单、也更不容易在 1024px 窄屏下盖住内容。
 */
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from '../../../components/ui/Icon.jsx';
import { BLUR, DURATION, EASE } from '../../../core/utils/motion.js';
import { useMotion } from '../../../core/hooks/useMotion.js';

const MotionDiv = motion.div;

/* 收起态两侧各给一个表意图形：左轨是列表（会话），右轨是面板（情境）。
   两侧共用同一个箭头会让用户分不清哪边装的是什么——窄轨上只有一个图标，
   它必须自己说清楚点开会看到什么。展开态则统一回箭头，指向收起的方向，
   把「再点一次会关掉」讲明白。 */
const COLLAPSED_GLYPH = {
  left: (
    <Icon size={16} viewBox="0 0 16 16" strokeWidth="1.6">
      <line x1="3" y1="4.5" x2="13" y2="4.5" />
      <line x1="3" y1="8" x2="13" y2="8" />
      <line x1="3" y1="11.5" x2="9.5" y2="11.5" />
    </Icon>
  ),
  right: (
    <Icon size={16} viewBox="0 0 16 16" strokeWidth="1.6">
      <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
      <line x1="9" y1="3" x2="9" y2="13" />
    </Icon>
  ),
};

/* 基准箭头朝下（v）；顺时针 90° 朝左、逆时针 90° 朝右，各指向自己收起的方向。 */
const CHEVRON_ROTATION = { left: 90, right: -90 };

/* 内容从抽屉外侧边缘浮进来、收起时退回外侧：左抽屉朝左，右抽屉朝右 */
const EDGE_OFFSET = { left: -12, right: 12 };

/* 进入会话页时两侧面板在正文之后依次浮现：左侧先，右侧后 */
const ENTER_DELAY = { left: DURATION.micro, right: DURATION.micro * 2 };

export default function SideDrawer({ side, open, onToggle, label, footer = null, children }) {
  const { reduced } = useMotion();
  const toggleLabel = open ? `收起${label}` : `展开${label}`;
  // 收起时内容先淡出、卸载完再收回宽度：内容还在离场时，抽屉保持展开宽度
  const [contentMounted, setContentMounted] = useState(open);
  if (open && !contentMounted) setContentMounted(true);
  const expanded = open || contentMounted;
  const edge = EDGE_OFFSET[side];

  return (
    <MotionDiv
      className={`we-side-drawer we-side-drawer--${side}${expanded ? ' we-side-drawer--open' : ''}`}
      initial={reduced ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.medium, delay: ENTER_DELAY[side], ease: EASE.ink }}
    >
      <button
        type="button"
        className="we-side-drawer-toggle"
        onClick={onToggle}
        aria-label={toggleLabel}
        aria-expanded={open}
        title={toggleLabel}
      >
        {open ? (
          <Icon
            size={16}
            viewBox="0 0 10 10"
            strokeWidth="2.5"
            style={{ transform: `rotate(${CHEVRON_ROTATION[side]}deg)` }}
          >
            <polyline points="2,3.5 5,6.5 8,3.5" />
          </Icon>
        ) : COLLAPSED_GLYPH[side]}
      </button>
      {/* 展开时宽度先让出来（CSS 过渡 base 时长），走过大半后内容从外侧边缘带着轻微模糊浮进来；
          收起时先退回外侧、卸载后再收宽度。减少动效时只剩瞬间的透明度切换 */}
      <AnimatePresence initial={false} onExitComplete={() => setContentMounted(false)}>
        {open && (
          <MotionDiv
            key="content"
            className="we-side-drawer-content"
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: edge, filter: `blur(${BLUR.entry})` }}
            animate={{
              opacity: 1,
              x: 0,
              filter: 'blur(0px)',
              transition: reduced ? { duration: 0 } : { duration: DURATION.base, delay: DURATION.quick, ease: EASE.ink },
            }}
            exit={reduced
              ? { opacity: 0, transition: { duration: 0 } }
              : { opacity: 0, x: edge, filter: `blur(${BLUR.entry})`, transition: { duration: DURATION.quick, ease: EASE.retract } }}
          >
            {children}
          </MotionDiv>
        )}
      </AnimatePresence>
      {/* footer（记忆检索状态指示器）不跟随收起/展开挂卸：它是独立于「会话列表内容」
          的实时反馈，收起时用户也应该能看到后台正在检索/记录记忆。 */}
      {footer}
    </MotionDiv>
  );
}
