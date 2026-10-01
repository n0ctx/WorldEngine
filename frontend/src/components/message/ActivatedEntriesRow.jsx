import { useRef, useLayoutEffect } from 'react';

const TRIGGER_LABEL = {
  keyword: '关键词',
  llm: 'LLM',
  state: '状态',
};

export default function ActivatedEntriesRow({ entries }) {
  const containerRef = useRef(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const measure = () => {
      const chips = Array.from(container.querySelectorAll('[data-chip]'));
      const badge = container.querySelector('[data-badge]');
      if (!chips.length) return;

      // Reset: show all chips, hide badge
      chips.forEach(c => { c.style.display = ''; });
      if (badge) badge.style.display = 'none';

      // Use the container's own right edge as boundary (it has flex: 1 / overflow: hidden)
      const boundary = container.getBoundingClientRect().right;

      let firstOverflow = chips.length;
      for (let i = 0; i < chips.length; i++) {
        if (chips[i].getBoundingClientRect().right > boundary + 1) {
          firstOverflow = i;
          break;
        }
      }

      if (firstOverflow >= chips.length) return; // all fit

      // Leave one slot for the badge
      let visible = Math.max(0, firstOverflow - 1);
      chips.slice(visible).forEach(c => { c.style.display = 'none'; });

      if (badge) {
        badge.style.display = '';
        badge.textContent = `+${chips.length - visible}`;
        badge.title = entries.slice(visible).map(e => e.title).join('、');

        // If badge itself overflows, hide one more chip
        if (badge.getBoundingClientRect().right > boundary + 1 && visible > 0) {
          chips[visible - 1].style.display = 'none';
          visible--;
          badge.textContent = `+${chips.length - visible}`;
          badge.title = entries.slice(visible).map(e => e.title).join('、');
        }
      }
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(container);
    return () => ro.disconnect();
  }, [entries]);

  if (!Array.isArray(entries) || entries.length === 0) return null;

  return (
    <div className="we-activated-entries-inline" ref={containerRef}>
      {entries.map((e) => {
        const label = TRIGGER_LABEL[e.trigger_type] || e.trigger_type || '';
        return (
          <span
            key={e.id}
            data-chip
            className="we-activated-entry-chip"
            title={label ? `${e.title} · 触发：${label}` : e.title}
          >
            {e.title}
          </span>
        );
      })}
      <span data-badge className="we-entries-overflow-badge" style={{ display: 'none' }} />
    </div>
  );
}
