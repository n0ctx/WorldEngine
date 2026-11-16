import { useState } from 'react';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import SectionTitle from '../ui/SectionTitle.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import Textarea from '../ui/Textarea.jsx';
import { getContextBlockSource } from '../../core/api/context-blocks.js';
import { TIER_LABEL, roundRange } from './context-summary-format.js';

function SourceRounds({ rounds }) {
  return (
    <ul className="mt-2 space-y-2">
      {rounds.map((round) => (
        <li key={round.round}>
          <div className="we-settings-toggle-hint">{`第 ${round.round} 轮`}</div>
          {round.messages.map((msg) => (
            <p key={msg.id} className="we-type-body whitespace-pre-wrap">
              {`${msg.role === 'user' ? '玩家' : '回复'}：${msg.content}`}
            </p>
          ))}
        </li>
      ))}
    </ul>
  );
}

/** 展开一级：被这个块吸收的下级摘要，加上下级没覆盖的原文轮次 */
function SourcePanel({ source }) {
  if (!source) return <Skeleton />;
  return (
    <Card variant="sunken" density="compact" className="mt-2 max-h-80 overflow-y-auto">
      {source.children.map((child) => (
        <div key={child.id} className="mb-2">
          <div className="we-settings-toggle-hint">{`${roundRange(child.fromRound, child.toRound)} · ${TIER_LABEL[child.tier]}`}</div>
          <p className="we-type-body whitespace-pre-wrap">{child.summary}</p>
        </div>
      ))}
      {source.rounds.length > 0 && <SourceRounds rounds={source.rounds} />}
    </Card>
  );
}

/**
 * 一个在用的压缩块：可改摘要正文，可展开查看来源，可恢复原文。
 * draft 由上层保存，关闭弹窗时据此判断有没有没保存的改动。
 */
export default function ContextBlockCard({ sessionId, block, draft, onDraftChange, onSave, onRestore, busy }) {
  const [source, setSource] = useState(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceError, setSourceError] = useState('');
  const dirty = draft !== block.summary;

  async function toggleSource() {
    if (sourceOpen) { setSourceOpen(false); return; }
    setSourceOpen(true);
    if (source) return;
    try {
      setSource(await getContextBlockSource(sessionId, block.id));
    } catch (err) {
      setSourceError(err.message || '原文加载失败');
    }
  }

  const title = [roundRange(block.fromRound, block.toRound), block.topic].filter(Boolean).join(' · ');
  return (
    <Card variant="outlined" density="compact">
      <SectionTitle
        level="group"
        actions={(
          <>
            <Badge tone={block.tier === 1 ? 'neutral' : 'info'}>{TIER_LABEL[block.tier]}</Badge>
            <Button type="button" variant="ghost" size="sm" onClick={toggleSource}>{sourceOpen ? '收起原文' : '查看原文'}</Button>
            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onRestore(block)}>恢复原文</Button>
          </>
        )}
      >
        {title}
      </SectionTitle>
      <Textarea value={draft} rows={4} disabled={busy} onChange={(e) => onDraftChange(block.id, e.target.value)} />
      {dirty && (
        <div className="mt-2 flex justify-end">
          <Button type="button" size="sm" disabled={busy || !draft.trim()} onClick={() => onSave(block)}>保存这段</Button>
        </div>
      )}
      {sourceOpen && (sourceError ? <p className="we-settings-toggle-hint mt-2">{sourceError}</p> : <SourcePanel source={source} />)}
    </Card>
  );
}
