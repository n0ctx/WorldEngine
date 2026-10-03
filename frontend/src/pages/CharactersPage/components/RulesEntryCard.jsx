import { useState } from 'react';
import Folder from '../../../components/motion/Folder.jsx';
import Card from '../../../components/ui/Card.jsx';
import { ChevronRight } from 'lucide-react';

// ── 世界规则入口卡：悬停时文件夹里的卡片错开，按下时飞出 ──────────────────────

export function RulesEntryCard({ entryCount, fieldCount, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const folderState = pressed ? 'open' : hovered ? 'hover' : 'rest';
  return (
    <Card
      as="button"
      type="button"
      interactive
      className="we-rules-entry-card"
      onClick={onOpen}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => { setHovered(false); setPressed(false); }}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      <Folder state={folderState} width={48} />
      <div className="we-rules-entry-info">
        <p className="we-rules-entry-label">这个世界的规则</p>
        <p className="we-rules-entry-count">
          {entryCount} 条设定条目 · {fieldCount} 个状态字段
        </p>
      </div>
      <ChevronRight size={16} />
    </Card>
  );
}
