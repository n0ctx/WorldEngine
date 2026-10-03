import {
  Badge, Button, Card, Checkbox, Divider, EmptyState, Input, ListItem, Range, SectionTitle, SegmentedControl, Select, Skeleton, TagInput, Textarea, ToggleSwitch,
} from '../../../components/index.js';
import { useState } from 'react';
import MessageItem from '../../../components/chat/MessageItem.jsx';
import VisualSection from '../VisualSection.jsx';
import { SELECT_OPTIONS } from '../demos/fixtures.js';

const noop = () => {};

const MESSAGES = [
  { id: 'lab-u', role: 'user', content: '我推开铁门，走进拳场。', created_at: '2026-01-01T12:00:00Z' },
  {
    id: 'lab-a',
    role: 'assistant',
    content: '雨从傍晚一直下到后半夜。灯泡在头顶晃，照得围栏上的血迹时明时暗。\n\n台下有人认出了你，低声报出一个数字。',
    created_at: '2026-01-01T12:00:05Z',
  },
];

const BADGE_TONES = [['neutral', '默认'], ['accent', '强调'], ['success', '新增'], ['warning', '覆盖'], ['danger', '错误'], ['info', '写作']];
const DATE_OPTIONS = [{ value: 'real', label: '真实日期' }, { value: 'story', label: '故事内日期' }];
const LOGIC_OPTIONS = [{ value: 'AND', label: 'AND' }, { value: 'OR', label: 'OR' }];

export function ControlsDemo() {
  const [on, setOn] = useState(true);
  const [value, setValue] = useState(40);
  const [choice, setChoice] = useState('a');
  const [date, setDate] = useState('real');
  const [logic, setLogic] = useState('AND');
  const [checked, setChecked] = useState(true);
  const [tags, setTags] = useState(['雨夜', '拳场']);
  return (
    <VisualSection id="controls">
      <div className="we-design-lab__grid">
        <div className="we-design-lab__row">
          {BADGE_TONES.map(([tone, label]) => <Badge key={tone} tone={tone}>{label}</Badge>)}
        </div>
        <div className="we-design-lab__row">
          <SegmentedControl label="日期模式" options={DATE_OPTIONS} value={date} onChange={setDate} />
          <SegmentedControl size="sm" label="条件逻辑" options={LOGIC_OPTIONS} value={logic} onChange={setLogic} />
        </div>
        <div className="we-design-lab__row">
          <Input placeholder="中号输入" />
          <Select value={choice} onChange={setChoice} options={SELECT_OPTIONS} />
        </div>
        <div className="we-design-lab__row">
          <Input size="sm" placeholder="小号输入" />
          <Select size="sm" value={choice} onChange={setChoice} options={SELECT_OPTIONS} />
        </div>
        <Textarea placeholder="多行输入" rows={3} />
        <TagInput
          label="关键词"
          values={tags}
          onAdd={(tag) => setTags([...tags, tag])}
          onRemove={(tag) => setTags(tags.filter((t) => t !== tag))}
        />
        <div className="we-design-lab__row">
          <Checkbox checked={checked} onChange={setChecked}>user 消息</Checkbox>
          <Checkbox checked={false} onChange={noop} disabled>不可用</Checkbox>
          <ToggleSwitch label="开关" checked={on} onChange={setOn} />
          <ToggleSwitch label="小号开关" size="sm" checked={on} onChange={setOn} />
          <ToggleSwitch label="不可用开关" checked={false} onChange={noop} disabled />
        </div>
        <Range value={value} min={0} max={100} onChange={(e) => setValue(Number(e.target.value))} />
      </div>
    </VisualSection>
  );
}

export function CardsDemo() {
  return (
    <VisualSection id="cards">
      <div className="we-design-lab__grid">
        <div className="we-design-lab__surfaces">
          <SectionTitle level="eyebrow" rule="beside">浮起卡 · 可点的独立内容</SectionTitle>
          <Card interactive tabIndex={0}>雨夜拳手 · 沉默寡言的地下拳场常客</Card>
          <Card interactive selected density="compact" tabIndex={0}>林默（当前扮演）</Card>
          <SectionTitle level="eyebrow" rule="beside">描边行 · 编辑器与设置里一行一项</SectionTitle>
          <Card variant="outlined" density="compact" interactive tabIndex={0}>开场白</Card>
          <Card variant="outlined" density="compact" interactive selected tabIndex={0}>古典羊皮纸</Card>
          <SectionTitle level="eyebrow" rule="beside">凹陷框 · 面板里再分一块</SectionTitle>
          <Card variant="sunken">找到那张欠条的主人</Card>
        </div>
        <div className="we-design-lab__surfaces">
          <SectionTitle level="section" rule="under">区块标题</SectionTitle>
          <SectionTitle level="group">小标题</SectionTitle>
          <SectionTitle level="eyebrow" actions={<Button variant="ghost" size="sm">新建</Button>}>分节标签</SectionTitle>
          <div className="we-design-lab__nav-sample">
            <ListItem selected aria-current="page">设定条目</ListItem>
            <ListItem>状态字段</ListItem>
          </div>
          <Divider />
          <Skeleton />
          <Divider size="lg" />
          <EmptyState size="sm" title="还没有记录关系" hint="对话里出现的人物关系会自动记在这里。" />
        </div>
        <EmptyState
          title="还没有世界"
          hint="创建第一个世界，开始写故事。"
          primaryAction={{ label: '创建世界', onClick: noop }}
          secondaryAction={{ label: '导入', onClick: noop }}
        />
      </div>
    </VisualSection>
  );
}

export function TopbarDemo() {
  return (
    <VisualSection id="topbar-skin">
      <div className="we-design-lab__topbar-box we-design-lab__desk">
        <div className="we-topbar">
          <div className="we-topbar-left">
            <button type="button" className="we-topbar-item we-topbar-crumb">世界</button>
            <span className="we-topbar-sep" aria-hidden="true">/</span>
            <button type="button" className="we-topbar-item we-topbar-crumb">
              <span className="we-topbar-crumb-label">无限轮回</span>
            </button>
            <span className="we-topbar-sep" aria-hidden="true">/</span>
            <span className="we-topbar-item we-topbar-crumb we-topbar-crumb-current" aria-current="page">
              <span className="we-topbar-crumb-label">写作</span>
            </span>
          </div>
          <div className="we-topbar-center" />
          <div className="we-topbar-actions">
            <button type="button" className="we-topbar-item">设置</button>
          </div>
        </div>
      </div>
    </VisualSection>
  );
}

export function ChatDemo() {
  return (
    <VisualSection id="chat">
      <div className="we-message-list">
        {MESSAGES.map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            character={{ name: '艾拉' }}
            persona={{ name: '玩家' }}
            onEdit={noop}
            onRegenerate={noop}
            onEditAssistant={noop}
            onDelete={noop}
          />
        ))}
      </div>
    </VisualSection>
  );
}
