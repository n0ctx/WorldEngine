import { useEffect, useState } from 'react';
import StateFieldEditor from '../../../components/state/StateFieldEditor';
import EntryEditor from '../../../components/state/EntryEditor';
import { listWorldEntries, getEntryConditions } from '../../../core/api/prompt-entries';
import { log } from '../../../core/utils/logger.js';
import { TYPE_LABEL } from '../constants.js';
import DefaultValueMatrix from './DefaultValueMatrix.jsx';

// ── 字段详情：定义 + 默认值矩阵 + 相关条目 ──
export default function FieldDetail({ worldId, scope, scopeKey, field, existingGroupNames, onDefinitionSaved }) {
  const [entryEditor, setEntryEditor] = useState(null); // { entry } | { prefill:true }
  const [entriesReload, setEntriesReload] = useState(0);
  const [editingDef, setEditingDef] = useState(false); // 是否就地展开「编辑定义」

  return (
    <div className="we-workshop-detail-inner">
      <div className="we-workshop-detail-head">
        <div>
          <h2 className="we-workshop-detail-title">{field.label}</h2>
          <span className="we-field-badge">{TYPE_LABEL[field.type] ?? field.type}</span>
          {field.description && <p className="we-workshop-detail-desc">{field.description}</p>}
        </div>
        <button
          className="we-btn we-btn-sm we-btn-secondary"
          onClick={() => setEditingDef((v) => !v)}
        >
          {editingDef ? '收起定义' : '编辑定义'}
        </button>
      </div>

      {editingDef && (
        <div className="we-workshop-section">
          <StateFieldEditor
            inline
            field={field}
            scope={scopeKey}
            onSave={async (payload) => {
              await scope.updateFn(field.id, payload);
              setEditingDef(false);
              onDefinitionSaved();
            }}
            onClose={() => setEditingDef(false)}
          />
        </div>
      )}

      <DefaultValueMatrix worldId={worldId} scope={scope} field={field} />

      <RelatedEntries
        worldId={worldId}
        scope={scope}
        field={field}
        reloadKey={entriesReload}
        onNew={() => setEntryEditor({ prefill: true })}
        onEdit={(entry) => setEntryEditor({ entry })}
      />

      {entryEditor && (
        <div className="we-workshop-section">
          <EntryEditor
            inline
            worldId={worldId}
            entry={entryEditor.entry ?? null}
            defaultTriggerType="state"
            existingGroupNames={existingGroupNames}
            prefillCondition={entryEditor.prefill ? { scope: scope.cnScope, field_label: field.label } : undefined}
            onClose={() => setEntryEditor(null)}
            onSave={() => { setEntryEditor(null); setEntriesReload((k) => k + 1); }}
          />
        </div>
      )}
    </div>
  );
}

// ── 相关条目：引用本字段的状态条件条目，跨字段打标记 ──
function RelatedEntries({ worldId, scope, field, reloadKey, onNew, onEdit }) {
  const [items, setItems] = useState([]); // { entry, otherFields:string[] }
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const entries = await listWorldEntries(worldId);
        const stateEntries = entries.filter((e) => e.trigger_type === 'state');
        const withConds = await Promise.all(stateEntries.map(async (e) => ({
          entry: e,
          conditions: await getEntryConditions(e.id),
        })));
        if (cancelled) return;
        const matchTarget = `${scope.cnScope}.${field.label}`;
        const result = [];
        for (const { entry, conditions } of withConds) {
          const refsThis = conditions.some((c) => fieldOfCondition(c.target_field) === matchTarget);
          if (!refsThis) continue;
          const others = [...new Set(
            conditions
              .map((c) => fieldOfCondition(c.target_field))
              .filter((t) => t && t !== matchTarget),
          )];
          result.push({ entry, otherFields: others });
        }
        setItems(result);
      } catch (err) {
        log.error('workshop.entries.load_failed', err, { toast: err.message || '加载相关条目失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [worldId, scope.cnScope, field.label, reloadKey]);

  return (
    <div className="we-workshop-section">
      <div className="we-workshop-section-head">
        <span className="we-workshop-section-title">相关触发条目</span>
        <button className="we-btn we-btn-sm we-btn-secondary" onClick={onNew}>+ 新建条目</button>
      </div>
      {loading ? (
        <p className="we-workshop-empty">加载中…</p>
      ) : items.length === 0 ? (
        <p className="we-workshop-empty">暂无引用该字段的条目</p>
      ) : (
        <ul className="we-workshop-entry-items">
          {items.map(({ entry, otherFields }) => (
            <li key={entry.id}>
              <button className="we-workshop-entry-item" onClick={() => onEdit(entry)}>
                <span className="we-workshop-entry-title">{entry.title || '（无标题）'}</span>
                {otherFields.length > 0 && (
                  <span className="we-workshop-entry-cross" title={`还引用了：${otherFields.join('、')}`}>
                    还引用了：{otherFields.join('、')}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// target_field 形如 "世界.字段名" 或 "世界.字段名.列key"，取前两段（scope.label）
function fieldOfCondition(targetField) {
  if (!targetField) return '';
  const parts = String(targetField).split('.');
  return parts.length >= 2 ? `${parts[0]}.${parts[1]}` : targetField;
}
