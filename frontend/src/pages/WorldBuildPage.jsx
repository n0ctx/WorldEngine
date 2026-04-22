import { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import { getWorld } from '../api/worlds';
import EntrySection from '../components/state/EntrySection';

export default function WorldBuildPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [world, setWorld] = useState(null);
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    getWorld(worldId).then(setWorld).catch(() => {});
    listWorldEntries(worldId).then(setEntries).catch(() => {});
  }, [worldId]);

  const alwaysEntries = entries.filter((e) => e.trigger_type === 'always');
  const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
  const llmEntries = entries.filter((e) => e.trigger_type === 'llm');

  function refresh() {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
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
    </div>
  );
}
