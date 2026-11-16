import { useEffect, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Dialog from '../ui/Dialog.jsx';
import ConfirmModal from '../ui/ConfirmModal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import ContextBlockCard from './ContextBlockCard.jsx';
import { roundRange, statsHint } from './context-summary-format.js';
import {
  getContextOverview,
  restoreContextBlock,
  searchContext,
  updateContextBlock,
} from '../../core/api/context-blocks.js';

function SearchResults({ hits }) {
  if (hits.length === 0) return <p className="we-settings-toggle-hint mt-2">没有找到相关内容</p>;
  return (
    <ul className="we-type-body mt-2 space-y-1">
      {hits.map((hit) => {
        const where = hit.kind === 'block' ? '摘要' : (hit.inView ? '原文' : '原文 · 已整理进摘要');
        return <li key={`${hit.kind}-${hit.blockId ?? hit.fromRound}`}>{`${roundRange(hit.fromRound, hit.toRound)}（${where}）：${hit.snippet}`}</li>;
      })}
    </ul>
  );
}

/** 剧情摘要：较早剧情被整理成的各段摘要。可改写、查看原文、恢复原文，也可以检索摘要与原文 */
export default function ContextSummaryModal({ sessionId, onClose }) {
  const [overview, setOverview] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState(null);

  function applyOverview(next) {
    setOverview(next);
    setDrafts(Object.fromEntries(next.blocks.map((block) => [block.id, block.summary])));
  }

  useEffect(() => {
    let cancelled = false;
    getContextOverview(sessionId)
      .then((next) => { if (!cancelled) applyOverview(next); })
      .catch((err) => { if (!cancelled) setError(err.message || '加载失败'); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const dirty = overview?.blocks.some((block) => drafts[block.id] !== block.summary) ?? false;

  function requestClose() {
    if (busy) return;
    if (dirty) { setConfirmDiscard(true); return; }
    onClose();
  }

  async function run(action) {
    setBusy(true);
    setError('');
    try {
      await action();
    } catch (err) {
      setError(err.message || '操作失败');
    } finally {
      setBusy(false);
    }
  }

  const saveBlock = (block) => run(async () => {
    const { block: saved } = await updateContextBlock(sessionId, block.id, { summary: drafts[block.id], topic: block.topic });
    setOverview((prev) => ({ ...prev, blocks: prev.blocks.map((b) => (b.id === saved.id ? saved : b)) }));
    setDrafts((prev) => ({ ...prev, [saved.id]: saved.summary }));
  });

  const restoreBlock = () => run(async () => {
    applyOverview(await restoreContextBlock(sessionId, restoreTarget.id));
    setRestoreTarget(null);
  });

  const runSearch = (event) => {
    event.preventDefault();
    if (!query.trim()) { setHits(null); return; }
    run(async () => setHits((await searchContext(sessionId, query.trim())).hits));
  };

  return (
    <Dialog
      size="lg"
      title="剧情摘要"
      busy={busy}
      onClose={requestClose}
      footer={<Button variant="ghost" onClick={requestClose} disabled={busy}>关闭</Button>}
    >
      <p className="we-settings-toggle-hint mb-2">{overview ? statsHint(overview.stats) : '加载中…'}</p>
      <form className="mb-3 flex gap-2" onSubmit={runSearch}>
        <Input size="sm" value={query} placeholder="在摘要与原文里查找人物、地点、物品…" onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit" variant="secondary" size="sm" disabled={busy}>查找</Button>
      </form>
      {hits && <SearchResults hits={hits} />}
      {!overview && !error && <Skeleton />}
      {overview?.blocks.length === 0 && (
        <EmptyState size="sm" title="还没有整理过的剧情" hint="原文超过短期预算后，副模型会把较早的剧情整理成摘要，原文仍然保留。" />
      )}
      <div className="mt-3 space-y-3">
        {overview?.blocks.map((block) => (
          <ContextBlockCard
            key={block.id}
            sessionId={sessionId}
            block={block}
            draft={drafts[block.id] ?? block.summary}
            onDraftChange={(id, value) => setDrafts((prev) => ({ ...prev, [id]: value }))}
            onSave={saveBlock}
            onRestore={setRestoreTarget}
            busy={busy}
          />
        ))}
      </div>
      {error && <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]">{error}</p>}

      <AnimatePresence>
        {confirmDiscard && (
          <ConfirmModal
            title="放弃未保存的修改？"
            message="你改了摘要但还没保存，关闭将丢弃这些改动。"
            confirmText="放弃"
            cancelText="继续编辑"
            danger
            onConfirm={async () => { setConfirmDiscard(false); onClose(); }}
            onClose={() => setConfirmDiscard(false)}
          />
        )}
        {restoreTarget && (
          <ConfirmModal
            title="恢复这段原文？"
            message={`${roundRange(restoreTarget.fromRound, restoreTarget.toRound)}的摘要会撤掉，改用它整理前的内容（下一级摘要或原文）。剧情继续增长后可能会被重新整理。`}
            confirmText="恢复原文"
            onConfirm={restoreBlock}
            onClose={() => setRestoreTarget(null)}
          />
        )}
      </AnimatePresence>
    </Dialog>
  );
}
