import { useState } from 'react';
import Folder from '../../../components/motion/Folder.jsx';
import Icon from '../../../components/ui/Icon.jsx';

// ── 世界规则入口卡：悬停时文件夹里的卡片错开，按下时飞出 ──────────────────────

export function RulesEntryCard({ entryCount, fieldCount, onOpen }) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const folderState = pressed ? 'open' : hovered ? 'hover' : 'rest';
  return (
    <button
      type="button"
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
        <p className="we-rules-entry-label">规则与状态</p>
        <p className="we-rules-entry-count">
          {entryCount} 条设定 · {fieldCount} 个状态字段
        </p>
      </div>
      <Icon size={16}>
        <polyline points="9 18 15 12 9 6" />
      </Icon>
    </button>
  );
}
