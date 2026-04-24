// frontend/src/pages/WorldConfigPage.jsx
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import { listTriggers } from '../api/triggers';
import EntrySection from '../components/state/EntrySection';
import TriggerCard from '../components/state/TriggerCard';
import TriggerEditor from '../components/state/TriggerEditor';
import VisualizationPanel from '../components/state/VisualizationPanel';
import { BackButton } from '../components';

export default function WorldConfigPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [editingTrigger, setEditingTrigger] = useState(null);

  useEffect(() => {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }, [worldId]);

  function refresh() {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }

  const alwaysEntries  = entries.filter((e) => e.trigger_type === 'always');
  const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
  const llmEntries     = entries.filter((e) => e.trigger_type === 'llm');

  return (
    <div className="we-characters-canvas">
      <BackButton onClick={() => navigate('/')} label="所有世界" />

      <div className="we-config-grid">
        {/* 左列：条目 */}
        <div className="we-config-col">
          <EntrySection
            title="常驻条目"
            icon="❦"
            desc="始终注入，适合世界观基础设定和写作风格规范"
            triggerType="always"
            entries={alwaysEntries}
            worldId={worldId}
            onRefresh={refresh}
          />
          <EntrySection
            title="关键词触发条目"
            icon="❦"
            desc="对话中出现指定词语时自动注入"
            triggerType="keyword"
            entries={keywordEntries}
            worldId={worldId}
            onRefresh={refresh}
          />
          <EntrySection
            title="AI 召回条目"
            icon="❦"
            desc="由 AI 判断当前情境是否需要注入"
            triggerType="llm"
            entries={llmEntries}
            worldId={worldId}
            onRefresh={refresh}
          />
        </div>

        {/* 中列：可视化总览 */}
        <div className="we-config-col we-config-col--mid">
          <VisualizationPanel entries={entries} triggers={triggers} />
        </div>

        {/* 右列：触发器 */}
        <div className="we-config-col">
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
  );
}
