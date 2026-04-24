import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { listWorldEntries } from '../api/prompt-entries';
import EntrySection from '../components/state/EntrySection';
import { BackButton } from '../components';

export default function WorldBuildPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const [entries, setEntries] = useState([]);

  useEffect(() => {
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
      <BackButton onClick={() => navigate('/')} label="所有世界" />

      <div className="we-world-page-content">
        <EntrySection
          title="常驻条目"
          icon="❦"
          desc="始终注入"
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
