/* 移植自 Rare UI scroll-progress — https://rareui.com
 * Copyright (c) 2026 Swami Malode，许可见同目录 RAREUI_LICENSE。
 * 阅读进度胶囊：一圈进度环加当前章节名；点开后同一块表面伸展成章节列表，点章节跳过去。
 * sections 里的 id 对应滚动容器中 data-chapter-id 的元素。 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useScroll, useSpring } from 'framer-motion';
import { useMotion } from '../../core/hooks/useMotion.js';

const EASE_IN_OUT = [0.65, 0, 0.35, 1];
const EASE_OUT = [0.22, 1, 0.36, 1];
const SIZE_SPRING = { type: 'spring', bounce: 0.16, duration: 0.5 };
const LABEL_CROSSFADE = { duration: 0.22, ease: EASE_OUT };
const LAYER_FADE = { duration: 0.24, ease: EASE_IN_OUT };
const INSTANT = { duration: 0 };
const ANCHOR_OFFSET = 120;

const elementOf = (container, id) => container?.querySelector(`[data-chapter-id="${CSS.escape(id)}"]`);

export default function ScrollProgress({ containerRef, sections }) {
  const layoutId = useId();
  const { reduced } = useMotion();
  const { scrollYProgress } = useScroll({ container: containerRef });
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 30, mass: 0.3 });

  const [activeId, setActiveId] = useState(sections[0]?.id);
  const [open, setOpen] = useState(false);
  const scrollLock = useRef(false);
  const scrollLockTimer = useRef(undefined);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const update = () => {
      if (scrollLock.current) return;
      const anchor = container.getBoundingClientRect().top + ANCHOR_OFFSET;
      const active = sections.findLast(({ id }) => {
        const top = elementOf(container, id)?.getBoundingClientRect().top;
        return top !== undefined && top <= anchor;
      });
      setActiveId(active?.id ?? sections[0]?.id);
    };
    update();
    container.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      container.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [sections, containerRef]);

  const label = sections.find((s) => s.id === activeId)?.label;

  const rootRef = useRef(null);
  const collapsedRef = useRef(null);
  const openRef = useRef(null);
  const labelRef = useRef(null);
  const [collapsedSize, setCollapsedSize] = useState();
  const [openSize, setOpenSize] = useState();
  const [labelWidth, setLabelWidth] = useState();

  useLayoutEffect(() => {
    const measure = () => {
      if (labelRef.current) setLabelWidth(labelRef.current.offsetWidth);
      if (collapsedRef.current) setCollapsedSize({ width: collapsedRef.current.offsetWidth, height: collapsedRef.current.offsetHeight });
      if (openRef.current) setOpenSize({ width: openRef.current.offsetWidth, height: openRef.current.offsetHeight });
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    for (const el of [labelRef.current, collapsedRef.current, openRef.current]) if (el) ro.observe(el);
    return () => ro.disconnect();
  }, [sections]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => clearTimeout(scrollLockTimer.current), []);

  const selectSection = (id) => {
    // 平滑滚动期间不按滚动位置改写当前章节，避免标签来回跳
    scrollLock.current = true;
    clearTimeout(scrollLockTimer.current);
    scrollLockTimer.current = setTimeout(() => { scrollLock.current = false; }, reduced ? 0 : 700);
    setActiveId(id);
    setOpen(false);
    elementOf(containerRef.current, id)?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };

  const size = open ? openSize : collapsedSize;
  const radius = open ? 18 : (collapsedSize?.height ?? 32) / 2;
  const blurIn = reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(4px)' };

  return (
    <div ref={rootRef} className="we-scroll-progress">
      <div className="we-scroll-progress__sizer" aria-hidden>
        <div ref={collapsedRef} className="we-scroll-progress__pill">
          <span className="we-scroll-progress__ring" />
          <span ref={labelRef} className="we-scroll-progress__label-text">{label}</span>
        </div>
        <div ref={openRef} className="we-scroll-progress__list">
          {sections.map((s) => (
            <div key={s.id} className="we-scroll-progress__item">
              <span className="we-scroll-progress__dot" />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {size && (
        <motion.div
          className="we-scroll-progress__surface"
          initial={false}
          animate={{ width: size.width, height: size.height, borderRadius: radius }}
          transition={reduced ? INSTANT : SIZE_SPRING}
        >
          <AnimatePresence initial={false} mode="popLayout">
            {open ? (
              <motion.ul
                key="list"
                className="we-scroll-progress__list we-scroll-progress__layer"
                initial={blurIn}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={blurIn}
                transition={LAYER_FADE}
              >
                {sections.map((s, i) => {
                  const isActive = s.id === activeId;
                  const stagger = { opacity: 0, y: 4, filter: 'blur(3px)' };
                  const itemIn = {
                    initial: reduced ? undefined : stagger,
                    animate: { opacity: 1, y: 0, filter: 'blur(0px)' },
                    transition: { duration: 0.3, ease: EASE_IN_OUT, delay: reduced ? 0 : 0.04 + i * 0.03 },
                  };
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => selectSection(s.id)}
                        aria-current={isActive ? 'location' : undefined}
                        className={`we-scroll-progress__item${isActive ? ' is-active' : ''}`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId={`${layoutId}-active`}
                            className="we-scroll-progress__highlight"
                            transition={reduced ? INSTANT : SIZE_SPRING}
                          />
                        )}
                        <motion.span className="we-scroll-progress__dot" {...itemIn} />
                        <motion.span className="we-scroll-progress__item-label" {...itemIn}>{s.label}</motion.span>
                      </button>
                    </li>
                  );
                })}
              </motion.ul>
            ) : (
              <motion.button
                key="pill"
                type="button"
                onClick={() => setOpen(true)}
                aria-label={`章节导航，当前：${label ?? ''}`}
                aria-expanded={false}
                className="we-scroll-progress__pill we-scroll-progress__layer"
                initial={blurIn}
                animate={{ opacity: 1, filter: 'blur(0px)' }}
                exit={blurIn}
                transition={LAYER_FADE}
              >
                <span className="we-scroll-progress__ring">
                  <svg viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="10" fill="none" strokeWidth="2.5" className="we-scroll-progress__track" />
                    <motion.circle
                      cx="12"
                      cy="12"
                      r="10"
                      fill="none"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      className="we-scroll-progress__fill"
                      style={{ pathLength: progress }}
                    />
                  </svg>
                </span>
                <span className="we-scroll-progress__label" style={{ width: labelWidth }}>
                  <AnimatePresence initial={false}>
                    {label && (
                      <motion.span
                        key={label}
                        className="we-scroll-progress__label-text"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(1.5px)' }}
                        animate={{ opacity: 1, filter: 'blur(0px)' }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, filter: 'blur(1.5px)' }}
                        transition={LABEL_CROSSFADE}
                      >
                        {label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}
