import { useState } from 'react';
import Icon from '../ui/Icon.jsx';
import { updateStateThread } from '../../core/api/state-memory.js';
import { isImeComposing } from '../../core/utils/ime.js';
import { log } from '../../core/utils/logger.js';

const STATUS_LABELS = { active: '进行中', dormant: '已搁置', resolved: '已解决', failed: '已失败' };

function participantNames(entities, participantIds) {
  const byId = new Map(entities.map((e) => [e.entity_id, e.name]));
  return (participantIds ?? []).map((id) => byId.get(id) ?? '（未知）').join('、');
}

function ThreadRow({ sessionId, thread, entities, reload }) {
  const [content, setContent] = useState(thread.content);
  const [error, setError] = useState('');
  const active = thread.status === 'active';
  const participants = participantNames(entities, thread.participants);

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
    <li className={`we-sm-thread-item${active ? '' : ' is-closed'}`}>
      <div className="we-sm-thread-head">
        <span className="we-sm-chip">{thread.kind}</span>
        <span className="we-sm-thread-meta">
          {participants && <>{participants} · </>}第 {thread.opened_round} 轮起
        </span>
        <span className="we-sm-thread-actions">
          {active || thread.status === 'dormant' ? (
            <>
              <button type="button" className="we-sm-text-btn" title="这件事已经了结" onClick={() => commit({ status: 'resolved' })}>已解决</button>
              <button type="button" className="we-sm-text-btn" title="这件事没能完成" onClick={() => commit({ status: 'failed' })}>已失败</button>
              {thread.status === 'dormant' && (
                <button type="button" className="we-sm-text-btn" title="这件事重新计入进行中" onClick={() => commit({ status: 'active' })}>重新打开</button>
              )}
            </>
          ) : (
            <>
              <span className="we-sm-thread-status">{STATUS_LABELS[thread.status] ?? thread.status}</span>
              <button type="button" className="we-sm-text-btn" onClick={() => commit({ status: 'active' })}>重新打开</button>
            </>
          )}
        </span>
      </div>
      <textarea
        className="we-sm-thread-content"
        aria-label="事项内容"
        value={content}
        rows={1}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (isImeComposing(e)) return;
          if (e.key === 'Escape' && content !== thread.content) {
            e.preventDefault();
            setContent(thread.content);
          }
        }}
        onBlur={() => { if (content.trim() && content !== thread.content) commit({ content: content.trim() }); }}
      />
      {error && <p className="we-settings-toggle-hint text-[var(--we-color-accent)]" role="alert">{error}</p>}
    </li>
  );
}

function Chevron({ open }) {
  return (
    <Icon size={16} className={`we-sm-chevron${open ? ' is-open' : ''}`}>
      <path d="M9 6l6 6-6 6" />
    </Icon>
  );
}

function ClosedGroup({ label, count, open, onToggle, children }) {
  return (
    <div className="we-sm-closed">
      <button type="button" className="we-sm-closed-toggle" aria-expanded={open} onClick={onToggle}>
        <Chevron open={open} />
        {label} {count}
      </button>
      {open && children}
    </div>
  );
}

export default function StateMemoryThreadTab({ sessionId, data, reload }) {
  const [showDormant, setShowDormant] = useState(false);
  const [showClosed, setShowClosed] = useState(false);
  const entities = data?.entities ?? [];
  const threads = data?.threads ?? [];
  const active = threads.filter((t) => t.status === 'active');
  const dormant = threads.filter((t) => t.status === 'dormant');
  const closed = threads.filter((t) => t.status === 'resolved' || t.status === 'failed');

  return (
    <div className="we-sm-thread-tab">
      <p className="we-sm-intro">尚未了结的承诺、任务、冲突等。进行中的事项会提醒 AI 延续剧情；长时间没再被提到的会搁置，不再提醒；了结后不再提供。</p>

      {active.length === 0 ? (
        <div className="we-sm-empty">
          <p className="we-sm-empty-title">暂无未了事项</p>
          <p className="we-sm-empty-hint">剧情里出现承诺、任务、冲突等时，AI 会自动记录。</p>
        </div>
      ) : (
        <ul className="we-sm-thread-list">
          {active.map((thread) => (
            <ThreadRow key={thread.thread_id} sessionId={sessionId} thread={thread} entities={entities} reload={reload} />
          ))}
        </ul>
      )}

      {dormant.length > 0 && (
        <ClosedGroup label="已搁置" count={dormant.length} open={showDormant} onToggle={() => setShowDormant((v) => !v)}>
          <ul className="we-sm-thread-list">
            {dormant.map((thread) => (
              <ThreadRow key={thread.thread_id} sessionId={sessionId} thread={thread} entities={entities} reload={reload} />
            ))}
          </ul>
        </ClosedGroup>
      )}

      {closed.length > 0 && (
        <ClosedGroup label="已结束" count={closed.length} open={showClosed} onToggle={() => setShowClosed((v) => !v)}>
          <ul className="we-sm-thread-list">
            {closed.map((thread) => (
              <ThreadRow key={thread.thread_id} sessionId={sessionId} thread={thread} entities={entities} reload={reload} />
            ))}
          </ul>
        </ClosedGroup>
      )}
    </div>
  );
}
