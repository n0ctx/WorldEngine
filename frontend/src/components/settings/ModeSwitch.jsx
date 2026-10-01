import SegmentedControl from '../ui/SegmentedControl';

const MODE_OPTIONS = [
  { value: 'chat', label: '对话' },
  { value: 'writing', label: '写作' },
];

export default function ModeSwitch({ mode, onChange }) {
  return <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onChange} label="设置模式" />;
}
