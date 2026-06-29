import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { BackButton } from '../../components';
import StateFieldEditor from '../../components/state/StateFieldEditor';
import StateValueField from '../../components/state/StateValueField';
import EntryEditor from '../../components/state/EntryEditor';
import {
  listWorldStateFields, createWorldStateField, updateWorldStateField, deleteWorldStateField,
} from '../../core/api/world-state-fields';
import {
  listCharacterStateFields, createCharacterStateField, updateCharacterStateField, deleteCharacterStateField,
} from '../../core/api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField, updatePersonaStateField, deletePersonaStateField,
} from '../../core/api/persona-state-fields';
import { getWorldStateValues, updateWorldStateValue } from '../../core/api/world-state-values';
import { getCharacterStateValues, updateCharacterStateValue } from '../../core/api/character-state-values';
import { getPersonaStateValuesByPersonaId, updatePersonaStateValueByPersonaId } from '../../core/api/persona-state-values';
import { getCharactersByWorld } from '../../core/api/characters';
import { listPersonas } from '../../core/api/personas';
import { listWorldEntries, getEntryConditions } from '../../core/api/prompt-entries';
import { log } from '../../core/utils/logger.js';

// 三种作用域的配置：字段模板 CRUD + 实例列表 + 实例默认值读写。
// cnScope 是状态条件 target_field 里用的中文作用域名（'世界.字段名'）。
const SCOPES = {
  world: {
    key: 'world', label: '世界', cnScope: '世界',
    listFn: listWorldStateFields, createFn: createWorldStateField,
    updateFn: updateWorldStateField, deleteFn: deleteWorldStateField,
    // 世界作用域只有一个实例：世界本身
    getInstances: async (worldId) => [{ id: worldId, name: '本世界' }],
    getValues: (worldId) => getWorldStateValues(worldId),
    updateValue: (worldId, _instId, fk, vj) => updateWorldStateValue(worldId, fk, vj),
  },
  character: {
    key: 'character', label: '角色', cnScope: '角色',
    listFn: listCharacterStateFields, createFn: createCharacterStateField,
    updateFn: updateCharacterStateField, deleteFn: deleteCharacterStateField,
    getInstances: (worldId) => getCharactersByWorld(worldId),
    getValues: (_worldId, charId) => getCharacterStateValues(charId),
    updateValue: (_worldId, charId, fk, vj) => updateCharacterStateValue(charId, fk, vj),
  },
  persona: {
    key: 'persona', label: '玩家', cnScope: '玩家',
    listFn: listPersonaStateFields, createFn: createPersonaStateField,
    updateFn: updatePersonaStateField, deleteFn: deletePersonaStateField,
    getInstances: (worldId) => listPersonas(worldId),
    getValues: (worldId, personaId) => getPersonaStateValuesByPersonaId(worldId, personaId),
    updateValue: (worldId, personaId, fk, vj) => updatePersonaStateValueByPersonaId(worldId, personaId, fk, vj),
  },
};

const SCOPE_TABS = [SCOPES.world, SCOPES.character, SCOPES.persona];
const TYPE_LABEL = { text: '文本', number: '数值', boolean: '布尔', enum: '枚举', list: '列表', datetime: '时间', table: '表格' };

export default function StateWorkshopPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();

  const [scopeKey, setScopeKey] = useState('character');
  const [fields, setFields] = useState([]);
  const [selectedKey, setSelectedKey] = useState(null);
  const [creatingField, setCreatingField] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  const scope = SCOPES[scopeKey];
  const selectedField = useMemo(
    () => fields.find((f) => f.field_key === selectedKey) ?? null,
    [fields, selectedKey],
  );

  const loadFields = useCallback(async (keepSelection) => {
    try {
      const list = await scope.listFn(worldId);
      setFields(list);
      setSelectedKey((prev) => {
        if (keepSelection && prev && list.some((f) => f.field_key === prev)) return prev;
        return list[0]?.field_key ?? null;
      });
    } catch (err) {
      log.error('workshop.fields.load_failed', err, { toast: err.message || '加载字段失败' });
    }
  }, [scope, worldId]);

  useEffect(() => { (async () => { await loadFields(false); })(); }, [loadFields]);

  return (
    <div className="we-characters-canvas">
      <BackButton onClick={() => navigate(-1)} label="返回" />

      <div className="we-workshop">
        <header className="we-workshop-header">
          <h1 className="we-workshop-title">状态工作台</h1>
          <p className="we-workshop-subtitle">在一处定义字段、设置各实例默认值、配置触发条目</p>
          <button className="we-btn we-btn-primary we-btn-sm" onClick={() => setWizardOpen(true)}>
            + 新建系统（向导）
          </button>
        </header>

        <div className="we-workshop-tabs">
          {SCOPE_TABS.map((s) => (
            <button
              key={s.key}
              className={`we-workshop-tab${s.key === scopeKey ? ' is-active' : ''}`}
              onClick={() => { setScopeKey(s.key); setSelectedKey(null); }}
            >
              {s.label}状态字段
            </button>
          ))}
        </div>

        <div className="we-workshop-body">
          {/* 左：字段列表 */}
          <aside className="we-workshop-list">
            <div className="we-workshop-list-head">
              <span>{scope.label}字段</span>
              <button className="we-btn we-btn-sm we-btn-secondary" onClick={() => setCreatingField(true)}>+ 添加</button>
            </div>
            {fields.length === 0 ? (
              <p className="we-workshop-empty">暂无字段</p>
            ) : (
              <ul className="we-workshop-field-items">
                {fields.map((f) => (
                  <li key={f.field_key}>
                    <button
                      className={`we-workshop-field-item${f.field_key === selectedKey ? ' is-active' : ''}`}
                      onClick={() => setSelectedKey(f.field_key)}
                    >
                      <span className="we-workshop-field-name">{f.label}</span>
                      <span className="we-field-badge">{TYPE_LABEL[f.type] ?? f.type}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </aside>

          {/* 右：字段详情 */}
          <section className="we-workshop-detail">
            {!selectedField ? (
              <p className="we-workshop-empty">选择左侧字段查看详情，或点「新建系统」一步步搭建</p>
            ) : (
              <FieldDetail
                key={`${scopeKey}:${selectedField.field_key}`}
                worldId={worldId}
                scope={scope}
                scopeKey={scopeKey}
                field={selectedField}
                onDefinitionSaved={() => loadFields(true)}
              />
            )}
          </section>
        </div>
      </div>

      {/* 新建字段定义 */}
      {creatingField && (
        <StateFieldEditor
          field={null}
          scope={scopeKey}
          onSave={async (payload) => {
            const created = await scope.createFn(worldId, payload);
            await loadFields(false);
            setSelectedKey(created?.field_key ?? payload.field_key);
          }}
          onClose={() => setCreatingField(false)}
        />
      )}

      {/* 新建系统向导 */}
      {wizardOpen && (
        <NewSystemWizard
          worldId={worldId}
          scope={scope}
          scopeKey={scopeKey}
          onClose={() => setWizardOpen(false)}
          onFinish={async (createdKey) => {
            setWizardOpen(false);
            await loadFields(false);
            if (createdKey) setSelectedKey(createdKey);
          }}
        />
      )}
    </div>
  );
}

// ── 字段详情：定义 + 默认值矩阵 + 相关条目 ──
function FieldDetail({ worldId, scope, scopeKey, field, onDefinitionSaved }) {
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
        <EntryEditor
          worldId={worldId}
          entry={entryEditor.entry ?? null}
          defaultTriggerType="state"
          prefillCondition={entryEditor.prefill ? { scope: scope.cnScope, field_label: field.label } : undefined}
          onClose={() => setEntryEditor(null)}
          onSave={() => { setEntryEditor(null); setEntriesReload((k) => k + 1); }}
        />
      )}
    </div>
  );
}

// ── 默认值矩阵：行=该作用域下各实例 ──
function DefaultValueMatrix({ worldId, scope, field }) {
  const [instances, setInstances] = useState([]);
  const [rowsByInstance, setRowsByInstance] = useState({}); // instId -> field row
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkDraftRef = useRef(null); // 批量草稿值（JSON 串），点「应用」前不写库

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const insts = await scope.getInstances(worldId);
        const valuesList = await Promise.all(insts.map((inst) => scope.getValues(worldId, inst.id)));
        if (cancelled) return;
        const map = {};
        insts.forEach((inst, i) => {
          const rows = Array.isArray(valuesList[i]) ? valuesList[i] : [];
          map[inst.id] = rows.find((r) => r.field_key === field.field_key) ?? null;
        });
        setInstances(insts);
        setRowsByInstance(map);
      } catch (err) {
        log.error('workshop.matrix.load_failed', err, { toast: err.message || '加载默认值失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scope, worldId, field.field_key, reload]);

  async function handleCellSave(instId, fieldKey, valueJson) {
    try {
      await scope.updateValue(worldId, instId, fieldKey, valueJson);
    } catch (err) {
      log.error('workshop.matrix.save_failed', err, { toast: err.message || '保存失败' });
    }
  }

  // 批量控件只把值记进草稿，不写库——避免自动保存控件每敲一下就 fan-out + remount 矩阵导致闪烁
  function handleBulkDraft(_fieldKey, valueJson) {
    bulkDraftRef.current = valueJson;
  }

  // 点「应用到全部」才真正写入所有实例，并一次性重拉使各格 remount 显示新值
  async function handleBulkApply() {
    const valueJson = bulkDraftRef.current;
    if (valueJson == null) return;
    setBulkSaving(true);
    try {
      await Promise.all(instances.map((inst) => scope.updateValue(worldId, inst.id, field.field_key, valueJson)));
      setReload((k) => k + 1);
    } catch (err) {
      log.error('workshop.matrix.bulk_failed', err, { toast: err.message || '批量保存失败' });
    } finally {
      setBulkSaving(false);
    }
  }

  // 批量控件复用某实例的字段行，但清空值使其从空白开始
  const sampleRow = instances.map((i) => rowsByInstance[i.id]).find(Boolean);
  const bulkField = sampleRow
    ? { ...sampleRow, value_json: null, default_value_json: null, effective_value_json: null }
    : null;

  return (
    <div className="we-workshop-section">
      <div className="we-workshop-section-head">
        <span className="we-workshop-section-title">各{scope.label}默认值</span>
        {bulkField && instances.length > 1 && (
          <div className="we-workshop-bulk">
            <span className="we-workshop-bulk-label">批量填同值</span>
            <StateValueField
              key={`bulk:${field.field_key}`}
              field={bulkField}
              onSave={handleBulkDraft}
            />
            <button
              type="button"
              className="we-btn we-btn-sm we-btn-secondary"
              onClick={handleBulkApply}
              disabled={bulkSaving}
            >
              {bulkSaving ? '应用中…' : '应用到全部'}
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <p className="we-workshop-empty">加载中…</p>
      ) : instances.length === 0 ? (
        <p className="we-workshop-empty">暂无{scope.label}</p>
      ) : (
        <div className="we-workshop-matrix">
          {instances.map((inst) => {
            const row = rowsByInstance[inst.id];
            return (
              <div key={inst.id} className="we-workshop-matrix-row">
                <span className="we-workshop-matrix-name">{inst.name || '未命名'}</span>
                <div className="we-workshop-matrix-value">
                  {row ? (
                    <StateValueField
                      field={row}
                      onSave={(fk, vj) => handleCellSave(inst.id, fk, vj)}
                    />
                  ) : (
                    <span className="we-workshop-empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
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

// ── 新建系统向导：定义字段 → 设默认值 → 配触发条目（可跳过）──
function NewSystemWizard({ worldId, scope, scopeKey, onClose, onFinish }) {
  const [step, setStep] = useState(1);
  const [createdField, setCreatedField] = useState(null);
  // 用 ref 实时记录是否已建字段：StateFieldEditor 保存后会同步调用 onClose，
  // 而 onClose 闭包捕获的 createdField 仍是建字段前的旧值（null），靠它判断会误关向导。
  const createdRef = useRef(null);

  // step1：复用 StateFieldEditor 创建字段。保存成功 → 推进到 step2；
  // 其内部随后调用的 onClose 因 createdRef 已置位而放行（不取消向导）。
  if (step === 1) {
    return (
      <StateFieldEditor
        field={null}
        scope={scopeKey}
        onSave={async (payload) => {
          const created = await scope.createFn(worldId, payload);
          const field = created ?? { field_key: payload.field_key, label: payload.label, type: payload.type };
          createdRef.current = field;
          setCreatedField(field);
          setStep(2);
        }}
        onClose={() => { if (!createdRef.current) onClose(); }}
      />
    );
  }

  if (step === 2) {
    return (
      <WizardShell title={`设置各${scope.label}默认值`} step={2}
        onClose={onClose}
        footer={(
          <>
            <button className="we-btn we-btn-secondary" onClick={() => onFinish(createdField?.field_key)}>
              跳过，不配条目
            </button>
            <button className="we-btn we-btn-primary" onClick={() => setStep(3)}>下一步：配触发条目</button>
          </>
        )}
      >
        <DefaultValueMatrix worldId={worldId} scope={scope} field={createdField} />
      </WizardShell>
    );
  }

  // step3：复用 EntryEditor，预填刚建字段为条件
  return (
    <EntryEditor
      worldId={worldId}
      entry={null}
      defaultTriggerType="state"
      prefillCondition={{ scope: scope.cnScope, field_label: createdField.label }}
      onClose={() => onFinish(createdField?.field_key)}
      onSave={() => onFinish(createdField?.field_key)}
    />
  );
}

function WizardShell({ title, step, children, footer, onClose }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4">
      <div className="we-dialog-panel w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="we-dialog-header flex items-center justify-between">
          <h2>新建系统 · 第 {step}/3 步</h2>
          <button className="we-btn we-btn-sm we-btn-ghost" onClick={onClose}>关闭</button>
        </div>
        <div className="we-dialog-body flex flex-col gap-4">
          <p className="we-workshop-section-title">{title}</p>
          {children}
        </div>
        <div className="we-dialog-footer">{footer}</div>
      </div>
    </div>
  );
}
