import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import { listTriggers } from '../api/triggers';
import { getWorld } from '../api/worlds';
import TriggerCard from '../components/state/TriggerCard';
import TriggerEditor from '../components/state/TriggerEditor';

export default function WorldStatePage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [world, setWorld] = useState(null);
  const [entries, setEntries] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [editingTrigger, setEditingTrigger] = useState(null);

  useEffect(() => {
    getWorld(worldId).then(setWorld).catch(() => {});
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }, [worldId]);

  function refresh() {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }

  return (
    <div className="we-characters-canvas">
      {/* 导航 */}
      <button
        onClick={() => navigate('/')}
        style={{ fontFamily: 'var(--we-font-serif)', fontSize: 13, color: 'var(--we-paper-shadow)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 24, padding: 0, transition: 'color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.color = 'var(--we-paper-base)'}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--we-paper-shadow)'}
      >
        ← 所有世界
      </button>

      {/* 页头 */}
      <div className="we-characters-header">
        <div>
          <h1 className="we-characters-title">{world?.name}</h1>
          <p className="we-characters-subtitle">CHARACTER ROSTER</p>
        </div>
      </div>

      {/* 三标签导航 */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(200,185,154,0.3)', marginBottom: '16px' }}>
        {[
          { label: '构建', path: `/worlds/${worldId}/build` },
          { label: '故事', path: `/worlds/${worldId}` },
          { label: '状态', path: `/worlds/${worldId}/state` },
        ].map(({ label, path }) => {
          const isActive = location.pathname === path;
          return (
            <button
              key={label}
              onClick={() => navigate(path)}
              style={{
                padding: '8px 20px',
                fontFamily: 'var(--we-font-serif)',
                fontSize: '14px',
                color: isActive ? 'var(--we-paper-base)' : 'var(--we-paper-shadow)',
                borderTop: 'none',
                borderLeft: 'none',
                borderRight: 'none',
                borderBottom: isActive ? '2px solid var(--we-vermilion)' : '2px solid transparent',
                background: 'none',
                cursor: 'pointer',
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

    <div style={{
      maxWidth: '900px',
      margin: '0 auto',
      paddingBottom: '20px',
    }}>
      {/* 状态触发器区 */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '18px', marginRight: '8px', color: 'var(--we-vermilion)' }}>❦</span>
            <span style={{
              fontFamily: 'var(--we-font-display)',
              fontSize: '16px',
              color: 'var(--we-paper-base)',
              fontStyle: 'italic',
            }}>
              状态触发器
            </span>
            <p style={{ fontSize: '13px', color: 'var(--we-paper-shadow)', marginTop: '4px', marginLeft: '26px' }}>
              当世界或角色状态满足条件时执行动作
            </p>
          </div>
          <button
            onClick={() => setEditingTrigger({})}
            style={{
              fontFamily: 'var(--we-font-serif)',
              fontSize: '13px',
              color: 'var(--we-vermilion)',
              background: 'none',
              border: '1px solid var(--we-vermilion)',
              borderRadius: 'var(--we-radius-sm)',
              padding: '4px 12px',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            + 新建触发器
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {triggers.map((t) => (
            <TriggerCard
              key={t.id}
              trigger={t}
              onEdit={() => setEditingTrigger(t)}
              onDelete={refresh}
              onToggle={refresh}
            />
          ))}
          {triggers.length === 0 && (
            <p style={{
              fontSize: '13px',
              color: 'var(--we-paper-deep)',
              textAlign: 'center',
              padding: '24px 0',
            }}>
              暂无触发器
            </p>
          )}
        </div>
      </div>

      {editingTrigger !== null && (
        <TriggerEditor
          worldId={worldId}
          trigger={editingTrigger?.id ? editingTrigger : null}
          entries={entries}
          onClose={() => setEditingTrigger(null)}
          onSave={() => { setEditingTrigger(null); refresh(); }}
        />
      )}
    </div>
    </div>
  );
}
