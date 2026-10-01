import Badge from '../ui/Badge.jsx';

export default function StorylineModeBadge({ mode }) {
  return <Badge tone={mode === 'writing' ? 'info' : 'accent'}>{mode === 'writing' ? '写作' : '对话'}</Badge>;
}
