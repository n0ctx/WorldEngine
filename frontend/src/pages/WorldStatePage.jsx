import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import { listTriggers } from '../api/triggers';
import EntrySection from '../components/state/EntrySection';
import TriggerCard from '../components/state/TriggerCard';
import TriggerEditor from '../components/state/TriggerEditor';

export default function WorldStatePage() {
  const { worldId } = useParams();
  const [entries, setEntries] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [editingTrigger, setEditingTrigger] = useState(null);

  useEffect(() => {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }, [worldId]);

  const alwaysEntries = entries.filter((e) => e.trigger_type === 'always');
  const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
  const llmEntries = entries.filter((e) => e.trigger_type === 'llm');

  function refresh() {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
    listTriggers(worldId).then(setTriggers).catch(() => {});
  }

  return (
    <div style={{
      padding: '24px 32px',
      maxWidth: '900px',
      margin: '0 auto',
    }}>
      <EntrySection
        title="常驻条目"
        icon="📌"
        desc="始终注入，适合世界观基础设定和写作风格规范"
        triggerType="always"
        entries={alwaysEntries}
        worldId={worldId}
        onRefresh={refresh}
      />

      <EntrySection
        title="关键词触发条目"
        icon="🔑"
        desc="对话中出现指定词语时自动注入"
        triggerType="keyword"
        entries={keywordEntries}
        worldId={worldId}
        onRefresh={refresh}
      />

      <EntrySection
        title="AI 召回条目"
        icon="🤖"
        desc="由 AI 判断当前情境是否需要注入"
        triggerType="llm"
        entries={llmEntries}
        worldId={worldId}
        onRefresh={refresh}
      />

      {/* 状态触发器区 */}
      <div style={{ marginTop: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '18px', marginRight: '8px' }}>⚡</span>
            <span style={{
              fontFamily: 'var(--we-font-display)',
              fontSize: '16px',
              color: 'var(--we-ink-primary)',
              fontStyle: 'italic',
            }}>
              状态触发器
            </span>
            <p style={{ fontSize: '13px', color: 'var(--we-ink-secondary)', marginTop: '4px', marginLeft: '26px' }}>
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
              color: 'var(--we-ink-faded)',
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
  );
}
