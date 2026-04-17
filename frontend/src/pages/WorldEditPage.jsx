import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { getWorld, updateWorld } from '../api/worlds';
import { downloadWorldCard, importWorld, readJsonFile } from '../api/importExport';
import EntryList from '../components/prompt/EntryList';
import StateFieldList from '../components/state/StateFieldList';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import SectionTabs from '../components/book/SectionTabs';
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
import { getWorldTimeline } from '../api/worldTimeline';

function StateValueField({ field, onSave }) {
  const parseValue = (vj) => {
    try { return vj != null ? JSON.parse(vj) : null; }
    catch { return vj ?? null; }
  };
  const [local, setLocal] = useState(() => parseValue(field.default_value_json));

  function saveValue(val) {
    onSave(field.field_key, JSON.stringify(val));
  }

  if (field.type === 'boolean') {
    return (
      <input
        type="checkbox"
        checked={!!local}
        onChange={(e) => { setLocal(e.target.checked); saveValue(e.target.checked); }}
        className="w-4 h-4"
        style={{ accentColor: 'var(--we-gold-leaf)' }}
      />
    );
  }
  if (field.type === 'number') {
    return (
      <Input
        type="number"
        value={local ?? ''}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => saveValue(local === '' || local == null ? null : Number(local))}
      />
    );
  }
  if (field.type === 'enum') {
    const options = (() => { try { return JSON.parse(field.enum_options || '[]'); } catch { return []; } })();
    return (
      <Select
        value={local ?? ''}
        onChange={(v) => { setLocal(v); saveValue(v); }}
        options={[{ value: '', label: '—' }, ...options.map(o => ({ value: o, label: o }))]}
      />
    );
  }
  if (field.type === 'list') {
    const displayValue = Array.isArray(local) ? local.join(', ') : (local ?? '');
    return (
      <Input
        type="text"
        value={displayValue}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const arr = String(local).split(',').map(s => s.trim()).filter(Boolean);
          saveValue(arr);
        }}
        placeholder="逗号分隔多个条目"
      />
    );
  }
  return (
    <Input
      type="text"
      value={local ?? ''}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={() => saveValue(String(local ?? ''))}
    />
  );
}

export default function WorldEditPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const worldImportRef = useRef(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [temperature, setTemperature] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [stateFields, setStateFields] = useState([]);
  const [timeline, setTimeline] = useState([]);

  useEffect(() => {
    Promise.all([
      getWorld(worldId),
      getWorldStateValues(worldId),
      getWorldTimeline(worldId),
    ]).then(([w, fields, tl]) => {
      setName(w.name ?? '');
      setSystemPrompt(w.system_prompt ?? '');
      setPostPrompt(w.post_prompt ?? '');
      setTemperature(w.temperature != null ? String(w.temperature) : '');
      setMaxTokens(w.max_tokens != null ? String(w.max_tokens) : '');
      setStateFields(fields);
      setTimeline(Array.isArray(tl) ? tl : []);
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
    if (!name.trim()) { setSaveError('名称为必填项'); return; }
    setSaving(true);
    setSaveError('');
    try {
      await updateWorld(worldId, {
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
        temperature: temperature === '' ? null : Number(temperature),
        max_tokens: maxTokens === '' ? null : parseInt(maxTokens, 10),
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

  async function handleImportWorldFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const data = await readJsonFile(file);
      await importWorld(data);
      navigate('/worlds');
    } catch (err) {
      alert(`导入失败：${err.message}`);
    } finally {
      setImporting(false);
      e.target.value = '';
    }
  }

  function handleClose() {
    navigate(-1);
  }

  if (loading) {
    return (
      isOverlay ? (
        <div className="we-settings-overlay" onClick={handleClose}>
          <div className="we-edit-panel we-edit-panel-overlay" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p className="we-edit-empty-text">加载中…</p>
          </div>
        </div>
      ) : (
        <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p className="we-edit-empty-text">加载中…</p>
        </div>
      )
    );
  }

  const sections = [
    {
      key: 'basic',
      label: '基础设定',
      content: (
        <div className="we-edit-form-stack">
          <div className="we-edit-form-group">
            <label className="we-edit-label">
              名称 <span style={{ color: 'var(--we-vermilion)' }}>*</span>
            </label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="世界的名称" />
          </div>
          <div className="we-edit-form-group">
            <label className="we-edit-label">世界 System Prompt</label>
            <MarkdownEditor value={systemPrompt} onChange={setSystemPrompt} placeholder="描述这个世界的背景、规则、氛围……" minHeight={144} />
          </div>
          <div className="we-edit-form-group">
            <label className="we-edit-label">
              后置提示词
              <span className="we-edit-label-hint">插入在用户消息之后，作为 user 角色发送</span>
            </label>
            <MarkdownEditor value={postPrompt} onChange={setPostPrompt} placeholder="每次对话附加的世界级指令，例如输出语言、格式要求……" minHeight={72} />
          </div>
          {saveError && <p className="we-edit-error">{saveError}</p>}
          <div className="we-edit-save-row">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: 'llm',
      label: 'LLM 参数',
      content: (
        <div className="we-edit-form-stack">
          <div className="we-edit-form-group">
            <label className="we-edit-label">Temperature</label>
            <Input
              type="number"
              step="0.01"
              min="0"
              max="2"
              value={temperature}
              onChange={e => setTemperature(e.target.value)}
              placeholder="留空则使用全局配置"
            />
            <p className="we-edit-hint">覆盖全局 temperature，留空则使用全局配置（世界级 &gt; 全局）</p>
          </div>
          <div className="we-edit-form-group">
            <label className="we-edit-label">最大 Token 数</label>
            <Input
              type="number"
              step="1"
              min="1"
              value={maxTokens}
              onChange={e => setMaxTokens(e.target.value)}
              placeholder="留空则使用全局配置"
            />
            <p className="we-edit-hint">覆盖全局 max_tokens，留空则使用全局配置</p>
          </div>
          {saveError && <p className="we-edit-error">{saveError}</p>}
          <div className="we-edit-save-row">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </div>
      ),
    },
    {
      key: 'state_templates',
      label: '状态模板',
      content: (
        <div>
          {stateFields.length > 0 && (
            <div className="we-edit-form-group">
              <h3 className="we-edit-subsection-title">世界默认状态值</h3>
              <div className="we-state-value-list">
                {stateFields.map(f => (
                  <div key={f.field_key} className="we-state-value-row">
                    <div>
                      <p className="we-state-value-label">{f.label}</p>
                      <p className="we-state-value-key">{f.field_key}</p>
                    </div>
                    <StateValueField field={f} onSave={handleStateValueSave} />
                  </div>
                ))}
              </div>
              <div className="we-edit-state-sep" />
            </div>
          )}
          <StateFieldList
            scope="world"
            worldId={worldId}
            listFn={listWorldStateFields}
            createFn={createWorldStateField}
            updateFn={updateWorldStateField}
            deleteFn={deleteWorldStateField}
            reorderFn={reorderWorldStateFields}
          />
          <div className="we-edit-state-sep" />
          <StateFieldList
            scope="character"
            worldId={worldId}
            listFn={listCharacterStateFields}
            createFn={createCharacterStateField}
            updateFn={updateCharacterStateField}
            deleteFn={deleteCharacterStateField}
            reorderFn={reorderCharacterStateFields}
          />
          <div className="we-edit-state-sep" />
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
      ),
    },
    {
      key: 'prompt_entries',
      label: 'Prompt 条目',
      content: <EntryList type="world" scopeId={worldId} />,
    },
    {
      key: 'timeline',
      label: '世界时间线',
      content: timeline.length === 0 ? (
        <p className="we-edit-empty-text">暂无时间线记录</p>
      ) : (
        <div className="we-edit-tl-list">
          {timeline.map(entry => (
            <div key={entry.id} className="we-edit-tl-item">
              <div className="we-edit-tl-dot" />
              <div>
                <p className="we-edit-tl-content">{entry.content}</p>
                {entry.created_at && (
                  <p className="we-edit-tl-meta">{new Date(entry.created_at).toLocaleDateString('zh-CN')}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'export',
      label: '导入导出',
      content: (
        <div>
          <div className="we-edit-form-group">
            <h3 className="we-edit-subsection-title">导出世界卡</h3>
            <p className="we-edit-hint">将此世界导出为 .weworld.json 文件，包含所有配置和状态字段定义。</p>
            <div style={{ marginTop: '12px' }}>
              <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                {exporting ? '导出中…' : '导出 .weworld.json'}
              </Button>
            </div>
          </div>
          <div className="we-edit-state-sep" />
          <div className="we-edit-form-group">
            <h3 className="we-edit-subsection-title">导入世界卡</h3>
            <p className="we-edit-hint">导入 .weworld.json 将创建一个新世界（不覆盖当前世界）。</p>
            <div style={{ marginTop: '12px' }}>
              <Button variant="secondary" onClick={() => worldImportRef.current?.click()} disabled={importing}>
                {importing ? '导入中…' : '导入世界卡…'}
              </Button>
              <input
                ref={worldImportRef}
                type="file"
                accept=".json,.weworld.json"
                className="hidden"
                onChange={handleImportWorldFile}
              />
            </div>
          </div>
        </div>
      ),
    },
  ];

  const content = (
    <div
      className={`we-edit-panel${isOverlay ? ' we-edit-panel-overlay' : ''}`}
      onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
    >
        <div className="we-edit-header">
          <button className="we-edit-back" onClick={handleClose}>← 返回</button>
          <h1 className="we-edit-title">编辑世界 · {name}</h1>
        </div>
        <SectionTabs sections={sections} defaultKey="basic" />
      </div>
  );

  return isOverlay ? (
    <div className="we-settings-overlay" onClick={handleClose}>
      {content}
    </div>
  ) : (
    <div className="we-edit-canvas">
      {content}
    </div>
  );
}
