import Badge from '../ui/Badge';

const TRIGGER_LABEL = {
  keyword: '关键词',
  llm: 'LLM',
  state: '状态',
};

export default function ActivatedEntriesRow({ entries }) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  return (
    <div className="we-activated-entries-row">
      {entries.map((e) => {
        const label = TRIGGER_LABEL[e.trigger_type] || e.trigger_type || '';
        return (
          <Badge key={e.id} title={label ? `${e.title} · 触发：${label}` : e.title}>
            {e.title}
          </Badge>
        );
      })}
    </div>
  );
}
