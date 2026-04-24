import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import EntrySection from '../components/state/EntrySection';
import { BackButton } from '../components';

export default function WorldConfigPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);

  useEffect(() => {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
  }, [worldId]);

  function refresh() {
    listWorldEntries(worldId).then(setEntries).catch(() => {});
  }

  const alwaysEntries  = entries.filter((e) => e.trigger_type === 'always');
  const keywordEntries = entries.filter((e) => e.trigger_type === 'keyword');
  const llmEntries     = entries.filter((e) => e.trigger_type === 'llm');
  const stateEntries   = entries.filter((e) => e.trigger_type === 'state');

  return (
    <div className="we-characters-canvas">
      <BackButton onClick={() => navigate('/')} label="所有世界" />

      <div className="we-config-grid">
        {/* 第1列：常驻条目 */}
        <div className="we-config-col">
          <EntrySection
            title="常驻条目"
            icon="❦"
            desc="始终注入"
            triggerType="always"
            entries={alwaysEntries}
            worldId={worldId}
            onRefresh={refresh}
          />
        </div>

        {/* 第2列：关键词条目 */}
        <div className="we-config-col">
          <EntrySection
            title="关键词条目"
            icon="❦"
            desc="对话中出现指定词语时自动注入"
            triggerType="keyword"
            entries={keywordEntries}
            worldId={worldId}
            onRefresh={refresh}
          />
        </div>

        {/* 第3列：AI召回条目 */}
        <div className="we-config-col">
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

        {/* 第4列：状态条件条目 */}
        <div className="we-config-col">
          <EntrySection
            title="状态条件条目"
            icon="❦"
            desc="当状态字段满足设定条件时自动注入"
            triggerType="state"
            entries={stateEntries}
            worldId={worldId}
            onRefresh={refresh}
          />
        </div>
      </div>
    </div>
  );
}
