const TRIGGER_LABEL = {
  keyword: '关键词',
  llm: 'LLM',
  state: '状态',
};

export default function ActivatedEntriesRow({ entries }) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <div className="we-activated-entries-inline">
      {entries.map((e) => {
        const label = TRIGGER_LABEL[e.trigger_type] || e.trigger_type || '';
        return (
          <span
            key={e.id}
            className="we-activated-entry-chip"
            title={label ? `${e.title} · 触发：${label}` : e.title}
          >
            {e.title}
          </span>
        );
      })}
    </div>
  );
}
