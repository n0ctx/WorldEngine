import { useState } from 'react';
import { updateStateThread } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

const STATUS_LABELS = { active: '进行中', resolved: '已解决', failed: '已失败' };

function participantNames(entities, participantIds) {
  const byId = new Map(entities.map((e) => [e.entity_id, e.name]));
  return (participantIds ?? []).map((id) => byId.get(id) ?? '（未知）').join('、');
}

function ThreadRow({ sessionId, thread, entities, reload }) {
  const [content, setContent] = useState(thread.content);
  const [error, setError] = useState('');

  async function commit(patch) {
    setError('');
    try {
      await updateStateThread(sessionId, thread.thread_id, patch);
      reload();
    } catch (err) {
      log.error('state-memory.thread.update_failed', err, { toast: err?.message || '更新事项失败' });
      setError(err.message || '更新失败');
    }
  }

  return (
    <li className="we-sm-thread-item">
      <div className="we-sm-thread-head">
        <span className="we-sm-thread-kind">［{thread.kind}］</span>
        <span className="we-settings-toggle-hint">
          {participantNames(entities, thread.participants)} · 第 {thread.opened_round} 轮起
        </span>
      </div>
      <textarea
        className="we-input we-sm-thread-content"
        value={content}
        rows={2}
        onChange={(e) => setContent(e.target.value)}
        onBlur={() => { if (content.trim() && content !== thread.content) commit({ content: content.trim() }); }}
      />
      <div className="we-sm-thread-actions">
        {thread.status === 'active' ? (
          <>
            <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={() => commit({ status: 'resolved' })}>标记已解决</button>
            <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={() => commit({ status: 'failed' })}>标记已失败</button>
          </>
        ) : (
          <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={() => commit({ status: 'active' })}>重新打开</button>
        )}
        <span className="we-settings-toggle-hint">{STATUS_LABELS[thread.status] ?? thread.status}</span>
      </div>
      {error && <p className="we-settings-toggle-hint text-[var(--we-color-accent)]" role="alert">{error}</p>}
    </li>
  );
}

export default function StateMemoryThreadTab({ sessionId, data, reload }) {
  const entities = data?.entities ?? [];
  const threads = data?.threads ?? [];
  const active = threads.filter((t) => t.status === 'active');
  const closed = threads.filter((t) => t.status !== 'active');

  return (
    <div className="we-sm-thread-tab">
      <div className="we-state-section-title"><span className="we-section-label">进行中</span></div>
      {active.length === 0 && <p className="we-section-empty">暂无进行中事项</p>}
      <ul className="we-sm-thread-list">
        {active.map((thread) => (
          <ThreadRow key={thread.thread_id} sessionId={sessionId} thread={thread} entities={entities} reload={reload} />
        ))}
      </ul>

      <div className="we-state-section-title"><span className="we-section-label">已结束</span></div>
      {closed.length === 0 && <p className="we-section-empty">暂无已结束事项</p>}
      <ul className="we-sm-thread-list">
        {closed.map((thread) => (
          <ThreadRow key={thread.thread_id} sessionId={sessionId} thread={thread} entities={entities} reload={reload} />
        ))}
      </ul>
    </div>
  );
}
