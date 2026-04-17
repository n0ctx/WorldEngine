import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWorld, updateWorld } from '../api/worlds';
import { downloadWorldCard } from '../api/importExport';
import EntryList from '../components/prompt/EntryList';
import StateFieldList from '../components/state/StateFieldList';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Select from '../components/ui/Select';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
} from '../api/worldStateFields';
import { getWorldStateValues, updateWorldStateValue } from '../api/worldStateValues.js';
import {
  listCharacterStateFields, createCharacterStateField,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../api/characterStateFields';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../api/personaStateFields';

function StateValueField({ field, onSave }) {
  const parseValue = (vj) => {
    try { return vj != null ? JSON.parse(vj) : null; }
    catch { return vj ?? null; }
  };
  const [local, setLocal] = useState(() => parseValue(field.default_value_json));

  function saveValue(val) {
    onSave(field.field_key, JSON.stringify(val));
  }

  const inputClass = 'w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent';

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => { setLocal(e.target.checked); saveValue(e.target.checked); }}
        className="accent-accent w-4 h-4"
      />
    );
  }
  if (field.type === 'number') {
    return (
      <input
        type="number"
        value={local ?? ''}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
        className={inputClass}
      />
    );
  }
  if (field.type === 'enum') {
    const options = (() => { try { return JSON.parse(field.enum_options || '[]'); } catch { return []; } })();
    return (
      <Select
        value={local ?? ''}
        onChange={(v) => { setLocal(v); saveValue(v); }}
        options={[{ value: '', label: '—' }, ...options.map((o) => ({ value: o, label: o }))]}
      />
    );
  }
  if (field.type === 'list') {
    const displayValue = Array.isArray(local) ? local.join(', ') : (local ?? '');
    return (
      <input
        type="text"
        value={displayValue}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const arr = String(local).split(',').map((s) => s.trim()).filter(Boolean);
          saveValue(arr);
        }}
        placeholder="逗号分隔多个条目"
        className={inputClass}
      />
    );
  }
  return (
    <input
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
      className={inputClass}
    />
  );
}

export default function WorldEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [stateFields, setStateFields] = useState([]);

  useEffect(() => {
    Promise.all([
      getWorld(worldId),
      getWorldStateValues(worldId),
    ]).then(([w, fields]) => {
      setName(w.name ?? '');
      setSystemPrompt(w.system_prompt ?? '');
      setPostPrompt(w.post_prompt ?? '');
      setStateFields(fields);
      setLoading(false);
    });
  }, [worldId]);

  async function handleStateValueSave(fieldKey, valueJson) {
    try {
      await updateWorldStateValue(worldId, fieldKey, valueJson);
    } catch (err) {
      console.error('世界状态默认值保存失败', err);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setSaveError('名称为必填项');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      await updateWorld(worldId, {
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
        temperature: null,
        max_tokens: null,
      });
      navigate(-1);
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const safeName = (name || 'world').replace(/[^\w\u4e00-\u9fa5]/g, '_');
      await downloadWorldCard(worldId, `${safeName}.weworld.json`);
    } catch (err) {
      alert(`导出失败：${err.message}`);
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-text-secondary">
        加载中…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      {/* 固定顶栏 */}
      <div className="sticky top-0 z-40 bg-canvas border-b border-border px-4">
        <div className="max-w-[56rem] mx-auto flex items-center justify-between py-2.5">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors"
          >
            ← 返回
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/settings')}
              className="text-sm text-text-secondary hover:text-text transition-colors opacity-60 hover:opacity-100"
            >
              设置
            </button>
            <span className="border-l border-border h-4" />
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-3 py-1.5 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {exporting ? '导出中…' : '导出世界卡'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-1.5 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>
      </div>

      {/* 内容区 */}
      <div className="px-4 pt-8 pb-10">
        <div className="max-w-[56rem] mx-auto">
          <h1 className="text-2xl font-serif font-semibold text-text tracking-tight mb-8">编辑世界</h1>

          {/* 表单 */}
          <div className="flex flex-col gap-5">
            <div>
              <label className="block text-sm text-text-secondary mb-1.5">名称 <span className="text-red-400">*</span></label>
              <input
                className="w-full px-3 py-2.5 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="世界的名称"
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">世界 System Prompt</label>
              <MarkdownEditor
                value={systemPrompt}
                onChange={setSystemPrompt}
                placeholder="描述这个世界的背景、规则、氛围……"
                minHeight={144}
              />
            </div>

            <div>
              <label className="block text-sm text-text-secondary mb-1.5">
                世界后置提示词
                <span className="text-text-secondary opacity-40 ml-1.5 text-xs">插入在用户消息之后，作为 user 角色发送</span>
              </label>
              <MarkdownEditor
                value={postPrompt}
                onChange={setPostPrompt}
                placeholder="每次对话附加的世界级指令，例如输出语言、格式要求……"
                minHeight={72}
              />
            </div>

            {saveError && <p className="text-sm text-red-400">{saveError}</p>}
          </div>

          {/* Prompt 条目 */}
          <div className="mt-10 border-t border-border pt-8">
            <div className="mb-10">
              <h2 className="text-lg font-serif font-semibold text-text mb-4">世界默认状态</h2>
              {stateFields.length === 0 ? (
                <p className="text-sm text-text-secondary opacity-40">暂无状态字段</p>
              ) : (
                <div className="space-y-3">
                  {stateFields.map((field) => (
                    <div key={field.field_key} className="grid grid-cols-[10rem_1fr] gap-3 items-center">
                      <div>
                        <p className="text-sm text-text">{field.label}</p>
                        <p className="text-xs text-text-secondary opacity-50">{field.field_key}</p>
                      </div>
                      <StateValueField field={field} onSave={handleStateValueSave} />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <EntryList type="world" scopeId={worldId} />
          </div>

          {/* 状态字段模板 */}
          <div className="mt-6 border-t border-border pt-8">
            <StateFieldList
              scope="world"
              worldId={worldId}
              listFn={listWorldStateFields}
              createFn={createWorldStateField}
              updateFn={updateWorldStateField}
              deleteFn={deleteWorldStateField}
              reorderFn={reorderWorldStateFields}
            />
          </div>
          <div className="mt-6 border-t border-border pt-8">
            <StateFieldList
              scope="character"
              worldId={worldId}
              listFn={listCharacterStateFields}
              createFn={createCharacterStateField}
              updateFn={updateCharacterStateField}
              deleteFn={deleteCharacterStateField}
              reorderFn={reorderCharacterStateFields}
            />
          </div>
          <div className="mt-6 border-t border-border pt-8">
            <StateFieldList
              scope="persona"
              worldId={worldId}
              listFn={listPersonaStateFields}
              createFn={createPersonaStateField}
              updateFn={updatePersonaStateField}
              deleteFn={deletePersonaStateField}
              reorderFn={reorderPersonaStateFields}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
