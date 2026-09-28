import { useState } from 'react';
import { isImeComposing } from '../../core/utils/ime.js';
import { useStateListInput } from './useStateListInput.js';

function LockIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function evidenceTitle(entry) {
  if (!entry) return undefined;
  const parts = [];
  if (entry.evidence) parts.push(`证据：${entry.evidence}`);
  if (entry.round != null) parts.push(`第 ${entry.round} 轮写入`);
  return parts.length ? parts.join('\n') : undefined;
}

function ProfileTextField({ entry, onCommit }) {
  const initial = entry?.value ?? '';
  const [draft, setDraft] = useState(initial);
  return (
    <input
      className="we-input"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { if (draft !== initial) onCommit(draft.trim() || null); }}
      onKeyDown={(e) => {
        if (isImeComposing(e)) return;
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
    />
  );
}

function ProfileAgeField({ entry, age, onCommit }) {
  const initial = entry?.value?.age ?? '';
  const [draft, setDraft] = useState(initial);
  return (
    <div className="we-sm-age">
      <span className="we-status-value">{age?.text ?? '未知'}</span>
      <input
        type="number"
        className="we-input we-sm-age-input"
        value={draft}
        placeholder="记录年龄"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft === initial) return;
          const num = Number(draft);
          if (draft !== '' && Number.isFinite(num)) onCommit({ age: num });
        }}
      />
    </div>
  );
}

function ProfileListField({ entry, onCommit }) {
  const items = Array.isArray(entry?.value) ? entry.value : [];
  const { input, setInput, addItem, removeItem, atMax } = useStateListInput(items, onCommit);
  return (
    <div className="we-tag-input">
      {items.map((item) => (
        <span key={item} className="we-tag">
          {item}
          <button type="button" aria-label={`删除 ${item}`} onClick={() => removeItem(item)}>×</button>
        </span>
      ))}
      <input
        className="we-tag-input-field"
        value={input}
        disabled={atMax}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (isImeComposing(e)) return;
          if (e.key === 'Enter') { e.preventDefault(); addItem(input); }
        }}
        placeholder={atMax ? '已达上限 10 条' : '输入后按回车'}
      />
    </div>
  );
}

/** 单个档案字段：文本 / 列表 / 年龄三种 kind，immutable 带锁形标记，悬停显示证据原文与写入轮次 */
export default function StateMemoryProfileField({ fieldDef, entry, age, onCommit }) {
  return (
    <div className="we-status-field we-sm-profile-field">
      <span className="we-status-key" title={evidenceTitle(entry)}>
        {fieldDef.mutability === 'immutable' && <LockIcon />}
        {fieldDef.label}
      </span>
      {fieldDef.kind === 'list' && <ProfileListField entry={entry} onCommit={onCommit} />}
      {fieldDef.kind === 'age' && <ProfileAgeField entry={entry} age={age} onCommit={onCommit} />}
      {fieldDef.kind === 'text' && <ProfileTextField entry={entry} onCommit={onCommit} />}
    </div>
  );
}
