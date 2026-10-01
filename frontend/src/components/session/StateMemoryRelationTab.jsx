import { useId, useState } from 'react';
import Badge from '../ui/Badge.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Input from '../ui/Input.jsx';
import IconButton from '../ui/IconButton.jsx';
import { X } from 'lucide-react';
import Select from '../ui/Select.jsx';
import { createStateRelation, deleteStateRelation } from '../../core/api/state-memory.js';
import { log } from '../../core/utils/logger.js';

const FREE_TEXT_OBJECT = '__text__';

function entityOptions(entities) {
  return entities.filter((e) => e.status === 'active').map((e) => ({ value: e.entity_id, label: e.name }));
}

function entityName(entities, entityId) {
  return entities.find((e) => e.entity_id === entityId)?.name ?? '（未知）';
}

/** 关系词建议：本会话已用过的关系词 + 系统约定的排他关系词 */
function predicateSuggestions(relations, schema) {
  return [...new Set([...relations.map((r) => r.predicate), ...(schema?.exclusivePredicates ?? [])])];
}

function NewRelationForm({ entities, relations, schema, sessionId, reload, onDone }) {
  const [subjectId, setSubjectId] = useState('');
  const [predicate, setPredicate] = useState('');
  const [objectChoice, setObjectChoice] = useState('');
  const [objectValue, setObjectValue] = useState('');
  const [error, setError] = useState('');
  const listId = useId();

  const options = entityOptions(entities);
  const freeText = objectChoice === FREE_TEXT_OBJECT;
  const objectId = freeText ? '' : objectChoice;
  const objectLabel = freeText ? objectValue.trim() : (objectId ? entityName(entities, objectId) : '');
  const preview = subjectId && predicate.trim() && objectLabel
    ? `${entityName(entities, subjectId)} —${predicate.trim()}→ ${objectLabel}`
    : '';

  async function handleCreate() {
    if (!subjectId) { setError('请选择是谁'); return; }
    if (!predicate.trim()) { setError('请填写关系'); return; }
    if (!objectId && !objectValue.trim()) { setError('请选择或填写对象'); return; }
    setError('');
    try {
      await createStateRelation(sessionId, {
        subject_id: subjectId,
        predicate: predicate.trim(),
        object_id: objectId || undefined,
        object_value: objectId ? undefined : objectValue.trim(),
      });
      reload();
      onDone();
    } catch (err) {
      log.error('state-memory.relation.create_failed', err, { toast: err?.message || '新增关系失败' });
      setError(err.message || '新增失败');
    }
  }

  return (
    <div className="we-sm-relation-form">
      <div className="we-sm-relation-form-row">
        <div className="we-sm-form-cell">
          <span className="we-sm-form-label">谁</span>
          <Select size="sm" value={subjectId} onChange={setSubjectId} options={[{ value: '', label: '选择' }, ...options]} />
        </div>
        <div className="we-sm-form-cell">
          <span className="we-sm-form-label">关系</span>
          <Input
            size="sm"
            placeholder="如：持有者、成员、师父"
            aria-label="关系"
            list={listId}
            value={predicate}
            onChange={(e) => setPredicate(e.target.value)}
          />
          <datalist id={listId}>
            {predicateSuggestions(relations, schema).map((p) => <option key={p} value={p} />)}
          </datalist>
        </div>
        <div className="we-sm-form-cell">
          <span className="we-sm-form-label">对象</span>
          <Select
            size="sm"
            value={objectChoice}
            onChange={setObjectChoice}
            options={[{ value: '', label: '选择' }, ...options, { value: FREE_TEXT_OBJECT, label: '其他（手动填写）' }]}
          />
        </div>
      </div>
      {freeText && (
        <Input
          size="sm"
          placeholder="填写对象，如：一把旧钥匙"
          aria-label="对象文字"
          value={objectValue}
          onChange={(e) => setObjectValue(e.target.value)}
        />
      )}
      <div className="we-sm-relation-form-footer">
        <span className="we-sm-relation-preview">{preview ? `将记录：${preview}` : ''}</span>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>取消</Button>
        <Button type="button" size="sm" variant="primary" onClick={handleCreate}>添加</Button>
      </div>
      {error && <p className="we-settings-toggle-hint text-[var(--we-color-accent)]" role="alert">{error}</p>}
    </div>
  );
}

function DeleteIcon() {
  return (
    <X size={16} />
  );
}

export default function StateMemoryRelationTab({ sessionId, data, schema, reload }) {
  const [adding, setAdding] = useState(false);
  const entities = data?.entities ?? [];
  const relations = data?.relations ?? [];
  const sorted = [...relations].sort((a, b) =>
    entityName(entities, a.subject_id).localeCompare(entityName(entities, b.subject_id), 'zh'));

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
      <div className="we-sm-tab-head">
        <p className="we-sm-intro">人物、物品、势力之间的固定关系，例如谁持有什么、谁属于哪个势力。AI 回复时会参考。</p>
        {!adding && (
          <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(true)}>
            ＋ 添加关系
          </Button>
        )}
      </div>

      {adding && (
        <NewRelationForm
          entities={entities}
          relations={relations}
          schema={schema}
          sessionId={sessionId}
          reload={reload}
          onDone={() => setAdding(false)}
        />
      )}

      {relations.length === 0 && !adding && (
        <EmptyState size="sm" title="还没有记录关系" hint="AI 在剧情里发现关系时会自动记录，也可以手动添加。" />
      )}

      <ul className="we-sm-relation-list">
        {sorted.map((relation) => (
          <li key={relation.relation_id} className="we-sm-relation-item">
            <span className="we-sm-relation-text">
              <span className="we-sm-relation-name">{entityName(entities, relation.subject_id)}</span>
              <span className="we-sm-relation-arrow" aria-hidden="true">—</span>
              <Badge>{relation.predicate}</Badge>
              <span className="we-sm-relation-arrow" aria-hidden="true">→</span>
              {relation.object_id ? (
                <span className="we-sm-relation-name">{entityName(entities, relation.object_id)}</span>
              ) : (
                <span className="we-sm-relation-free">{relation.object_value}</span>
              )}
            </span>
            <IconButton
              size="sm"
              variant="danger"
              label="删除关系"
              onClick={() => handleDelete(relation.relation_id)}
            >
              <DeleteIcon />
            </IconButton>
          </li>
        ))}
      </ul>
    </div>
  );
}
