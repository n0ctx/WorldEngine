import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import { listTriggers } from '../api/triggers';
import { getWorld } from '../api/worlds';
import TriggerCard from '../components/state/TriggerCard';
import TriggerEditor from '../components/state/TriggerEditor';
import { WorldTabNav, BackButton, buildWorldTabs } from '../components';

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
      <BackButton onClick={() => navigate('/')} label="所有世界" />

      {/* 页头 */}
      <div className="we-characters-header">
        <div>
          <h1 className="we-characters-title">{world?.name}</h1>
          <p className="we-characters-subtitle">CHARACTER ROSTER</p>
        </div>
      </div>

      <WorldTabNav
        tabs={buildWorldTabs(worldId)}
        activeTab={location.pathname}
        onTabChange={(path) => navigate(path)}
      />

      <div className="we-world-page-content">
        {/* 状态触发器区 */}
        <div className="we-trigger-section">
          <div className="we-trigger-header">
            <div className="we-trigger-heading">
              <span className="we-trigger-icon">❦</span>
              <span className="we-trigger-title">状态触发器</span>
              <p className="we-trigger-desc">当世界或角色状态满足条件时执行动作</p>
            </div>
            <button
              className="we-trigger-new-btn"
              onClick={() => setEditingTrigger({})}
            >
              + 新建触发器
            </button>
          </div>

          <div className="we-trigger-list">
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
              <p className="we-trigger-empty">暂无触发器</p>
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
