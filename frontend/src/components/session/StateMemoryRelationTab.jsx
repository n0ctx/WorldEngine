import { useState } from 'react';
import Select from '../ui/Select.jsx';
import { createStateRelation, deleteStateRelation } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

function entityOptions(entities) {
  return entities.filter((e) => e.status === 'active').map((e) => ({ value: e.entity_id, label: e.name }));
}

function entityName(entities, entityId) {
  return entities.find((e) => e.entity_id === entityId)?.name ?? '（未知实体）';
}

function NewRelationForm({ entities, sessionId, reload }) {
  const [subjectId, setSubjectId] = useState('');
  const [predicate, setPredicate] = useState('');
  const [objectId, setObjectId] = useState('');
  const [objectValue, setObjectValue] = useState('');
  const [error, setError] = useState('');

  const options = entityOptions(entities);

  async function handleCreate() {
    if (!subjectId || !predicate.trim()) { setError('缺少主体或谓词'); return; }
    if (!objectId && !objectValue.trim()) { setError('缺少客体'); return; }
    setError('');
    try {
      await createStateRelation(sessionId, {
        subject_id: subjectId,
        predicate: predicate.trim(),
        object_id: objectId || undefined,
        object_value: objectId ? undefined : objectValue.trim(),
      });
      setSubjectId(''); setPredicate(''); setObjectId(''); setObjectValue('');
      reload();
    } catch (err) {
      log.error('state-memory.relation.create_failed', err, { toast: err?.message || '新增关系失败' });
      setError(err.message || '新增失败');
    }
  }

  return (
    <div className="we-sm-relation-form">
      <Select value={subjectId} onChange={setSubjectId} options={[{ value: '', label: '选择主体' }, ...options]} />
      <input className="we-input" placeholder="谓词" value={predicate} onChange={(e) => setPredicate(e.target.value)} />
      <Select value={objectId} onChange={setObjectId} options={[{ value: '', label: '选择客体实体' }, ...options]} />
      <input
        className="we-input"
        placeholder="或填客体文字"
        value={objectValue}
        disabled={!!objectId}
        onChange={(e) => setObjectValue(e.target.value)}
      />
      <button type="button" className="we-btn we-btn-sm we-btn-secondary" onClick={handleCreate}>新增关系</button>
      {error && <p className="we-settings-toggle-hint text-[var(--we-color-accent)]" role="alert">{error}</p>}
    </div>
  );
}

export default function StateMemoryRelationTab({ sessionId, data, reload }) {
  const entities = data?.entities ?? [];
  const relations = data?.relations ?? [];

  async function handleDelete(relationId) {
    try {
      await deleteStateRelation(sessionId, relationId);
      reload();
    } catch (err) {
      log.error('state-memory.relation.delete_failed', err, { toast: err?.message || '删除关系失败' });
    }
  }

  return (
    <div className="we-sm-relation-tab">
      <NewRelationForm entities={entities} sessionId={sessionId} reload={reload} />
      {relations.length === 0 && <p className="we-section-empty">暂无关系</p>}
      <ul className="we-sm-relation-list">
        {relations.map((relation) => (
          <li key={relation.relation_id} className="we-sm-relation-item">
            <span>
              {entityName(entities, relation.subject_id)}
              {' —'}{relation.predicate}{'→ '}
              {relation.object_id ? entityName(entities, relation.object_id) : relation.object_value}
            </span>
            <button
              type="button"
              className="we-btn we-btn-sm we-btn-danger"
              onClick={() => handleDelete(relation.relation_id)}
            >
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
