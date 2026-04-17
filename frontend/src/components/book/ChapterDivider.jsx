import { useRef, useEffect } from 'react';

const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function toChapterNum(n) {
  return n <= 10 ? CN_NUMS[n - 1] : String(n);
}

/**
 * 章节起始标题（重量级分隔）
 * Props: { chapterIndex, title }
 */
export default function ChapterDivider({ chapterIndex, title }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('we-chapter-header--visible');
          obs.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <header ref={ref} className="we-chapter-header">
      <div className="we-chapter-num">第 {toChapterNum(chapterIndex)} 章</div>
      <h2 className="we-chapter-title">{title}</h2>
      <div className="we-chapter-fleuron">
        <span className="we-chapter-fleuron-line" />
        <span>❦</span>
        <span className="we-chapter-fleuron-line" />
      </div>
    </header>
  );
}
