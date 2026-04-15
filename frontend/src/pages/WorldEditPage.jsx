import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getWorld, updateWorld } from '../api/worlds';
import { downloadWorldCard } from '../api/importExport';
import EntryList from '../components/prompt/EntryList';
import StateFieldList from '../components/state/StateFieldList';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
} from '../api/worldStateFields';
import {
  listCharacterStateFields, createCharacterStateField,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../api/characterStateFields';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../api/personaStateFields';

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
  const [temperature, setTemperature] = useState(1.0);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [useGlobalTemp, setUseGlobalTemp] = useState(true);
  const [useGlobalMaxTokens, setUseGlobalMaxTokens] = useState(true);

  useEffect(() => {
    getWorld(worldId).then((w) => {
      setName(w.name ?? '');
      setSystemPrompt(w.system_prompt ?? '');
      setPostPrompt(w.post_prompt ?? '');
      setTemperature(w.temperature ?? 1.0);
      setMaxTokens(w.max_tokens ?? 2048);
      setUseGlobalTemp(w.temperature == null);
      setUseGlobalMaxTokens(w.max_tokens == null);
      setLoading(false);
    });
  }, [worldId]);

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
        temperature: useGlobalTemp ? null : temperature,
        max_tokens: useGlobalMaxTokens ? null : maxTokens,
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
    <div className="min-h-screen bg-canvas px-4 py-10">
      <div className="max-w-2xl mx-auto">
        {/* 导航 */}
        <div className="flex items-center justify-between mb-8">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors"
          >
            ← 返回
          </button>
          <button
            onClick={() => navigate('/settings')}
            className="text-sm text-text-secondary hover:text-text transition-colors opacity-60 hover:opacity-100"
          >
            设置
          </button>
        </div>

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

          {/* Temperature */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Temperature</label>
              <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={useGlobalTemp}
                  onChange={(e) => setUseGlobalTemp(e.target.checked)}
                  className="accent-accent"
                />
                使用全局默认
              </label>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0.1" max="2.0" step="0.1"
                value={temperature}
                disabled={useGlobalTemp}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="flex-1 accent-accent disabled:opacity-40"
              />
              <span className="w-10 text-right text-sm text-text font-mono">
                {useGlobalTemp ? '—' : temperature.toFixed(1)}
              </span>
            </div>
          </div>

          {/* Max Tokens */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm text-text-secondary">Max Tokens</label>
              <label className="flex items-center gap-1.5 text-sm text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={useGlobalMaxTokens}
                  onChange={(e) => setUseGlobalMaxTokens(e.target.checked)}
                  className="accent-accent"
                />
                使用全局默认
              </label>
            </div>
            <input
              type="number"
              min="64" max="32000" step="64"
              value={maxTokens}
              disabled={useGlobalMaxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent disabled:opacity-40"
            />
          </div>

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}

          <div className="flex justify-between items-center pt-2">
            <button
              onClick={handleExport}
              disabled={exporting}
              className="px-4 py-2.5 text-sm border border-border rounded-lg text-text-secondary hover:text-text hover:border-accent/40 transition-colors disabled:opacity-50"
            >
              {exporting ? '导出中…' : '导出世界卡'}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </div>

        {/* Prompt 条目 */}
        <div className="mt-10 border-t border-border pt-8">
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
  );
}
