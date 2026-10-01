import { useMemo } from 'react';
import Dialog from '../ui/Dialog.jsx';
import SectionTabs from '../ui/SectionTabs.jsx';
import Skeleton from '../ui/Skeleton.jsx';
import { useStateMemory, useStateMemorySchema } from '../../core/hooks/useStateMemory.js';
import StateMemoryEntityTab from './StateMemoryEntityTab.jsx';
import StateMemoryRelationTab from './StateMemoryRelationTab.jsx';
import StateMemoryThreadTab from './StateMemoryThreadTab.jsx';

function TabLabel({ text, count }) {
  return (
    <>
      {text}
      <span className="we-sm-tab-count">{count}</span>
    </>
  );
}

const ENTITY_TABS = [
  { key: 'characters', label: '角色', types: ['player', 'character'], intro: '玩家和故事里出现过的人物。置顶的每轮都会提供给 AI。' },
  { key: 'locations', label: '地点', types: ['location'], intro: '故事里出现过的地点。置顶的每轮都会提供给 AI。' },
  { key: 'items', label: '物品', types: ['item', 'other'], intro: '故事里出现过的物品和其他事物。置顶的每轮都会提供给 AI。' },
  { key: 'factions', label: '势力', types: ['faction'], intro: '故事里出现过的组织和势力。置顶的每轮都会提供给 AI。' },
];

export default function StateMemoryModal({ sessionId, onClose }) {
  const { data, error, loading, reload } = useStateMemory(sessionId);
  const { schema } = useStateMemorySchema();

  const sections = useMemo(() => {
    const entities = data?.entities ?? [];
    const relations = data?.relations ?? [];
    const threads = data?.threads ?? [];
    return [
      ...ENTITY_TABS.map(({ key, label, types, intro }) => ({
        key,
        label: <TabLabel text={label} count={entities.filter((e) => e.status === 'active' && types.includes(e.type)).length} />,
        content: <StateMemoryEntityTab sessionId={sessionId} data={data} schema={schema} reload={reload} types={types} intro={intro} />,
      })),
      {
        key: 'relations',
        label: <TabLabel text="关系" count={relations.length} />,
        content: <StateMemoryRelationTab sessionId={sessionId} data={data} schema={schema} reload={reload} />,
      },
      {
        key: 'threads',
        label: <TabLabel text="未了事项" count={threads.filter((t) => t.status === 'active').length} />,
        content: <StateMemoryThreadTab sessionId={sessionId} data={data} reload={reload} />,
      },
    ];
  }, [sessionId, data, schema, reload]);

  return (
    <Dialog
      size="xl"
      title="状态记忆"
      description="AI 每轮从剧情里整理出的人物、关系和未了结的事，后续回复会参考这些内容。记错了可以直接在这里改。"
      bodyClassName="we-sm-body-wrap"
      onClose={onClose}
    >
      {loading && !data ? (
        <Skeleton />
      ) : error ? (
        <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">{error}</p>
      ) : (
        <SectionTabs sections={sections} defaultKey="characters" staticMotion />
      )}
    </Dialog>
  );
}
