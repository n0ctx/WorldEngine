import { useMemo } from 'react';
import ModalShell from '../ui/ModalShell.jsx';
import SectionTabs from '../ui/SectionTabs.jsx';
import { useStateMemory, useStateMemorySchema } from '../../core/hooks/useStateMemory.js';
import StateMemoryEntityTab from './StateMemoryEntityTab.jsx';
import StateMemoryRelationTab from './StateMemoryRelationTab.jsx';
import StateMemoryThreadTab from './StateMemoryThreadTab.jsx';

export default function StateMemoryModal({ sessionId, onClose }) {
  const { data, error, loading, reload } = useStateMemory(sessionId);
  const { schema } = useStateMemorySchema();

  const sections = useMemo(() => ([
    {
      key: 'entities',
      label: '实体',
      content: <StateMemoryEntityTab sessionId={sessionId} data={data} schema={schema} reload={reload} />,
    },
    {
      key: 'relations',
      label: '关系',
      content: <StateMemoryRelationTab sessionId={sessionId} data={data} reload={reload} />,
    },
    {
      key: 'threads',
      label: '事项',
      content: <StateMemoryThreadTab sessionId={sessionId} data={data} reload={reload} />,
    },
  ]), [sessionId, data, schema, reload]);

  return (
    <ModalShell onClose={onClose} maxWidth="max-w-3xl">
      <div className="we-dialog-header">
        <h2>状态记忆</h2>
      </div>

      <div className="we-dialog-body we-sm-body-wrap">
        {loading && !data ? (
          <p className="we-settings-toggle-hint">加载中…</p>
        ) : error ? (
          <p className="we-settings-toggle-hint mt-2 text-[var(--we-color-accent)]" role="alert">{error}</p>
        ) : (
          <SectionTabs sections={sections} defaultKey="entities" staticMotion />
        )}
      </div>

      <div className="we-dialog-footer">
        <button onClick={onClose} className="we-confirm-cancel">关闭</button>
      </div>
    </ModalShell>
  );
}
