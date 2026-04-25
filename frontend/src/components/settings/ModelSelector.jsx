import { useState, useEffect, useCallback } from 'react';
import Button from '../ui/Button';
import ModelCombobox from '../ui/ModelCombobox';
import { useDisplaySettingsStore } from '../../store/displaySettings.js';

function extractPricing(model) {
  if (!model || typeof model !== 'object') return null;
  return {
    inputPrice: model.inputPrice ?? 0,
    outputPrice: model.outputPrice ?? 0,
    cacheWritePrice: model.cacheWritePrice ?? null,
    cacheReadPrice: model.cacheReadPrice ?? null,
  };
}

export default function ModelSelector({ value, onChange, loadModels }) {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');
  const setCurrentModelPricing = useDisplaySettingsStore((s) => s.setCurrentModelPricing);

  // 当模型列表或当前值变化时，同步价格到 store
  useEffect(() => {
    if (!models.length || !value) return;
    const found = models.find((m) => (typeof m === 'object' ? m.id : m) === value);
    setCurrentModelPricing(extractPricing(found));
  }, [models, value, setCurrentModelPricing]);

  const load = useCallback(async () => {
    setStatus('loading');
    setErrMsg('');
    try {
      const data = await loadModels();
      const list = data.models || [];
      setModels(list);
      setStatus('ok');
      if (list.length > 0 && !value) {
        const first = list[0];
        const modelId = typeof first === 'string' ? first : first.id;
        setCurrentModelPricing(extractPricing(first));
        onChange(modelId);
      }
    } catch (e) {
      setErrMsg(e.message || '无法获取模型列表，请检查 API Key 和网络连接');
      setStatus('error');
    }
  }, [loadModels, onChange, value, setCurrentModelPricing]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial model discovery owns loading state.
    load();
  }, [load]);

  if (status === 'loading') {
    return <p className="we-model-selector-loading">获取模型列表中…</p>;
  }
  if (status === 'error') {
    return (
      <div>
        <p className="we-model-selector-error">{errMsg}</p>
        <Button variant="ghost" size="sm" onClick={load}>重试</Button>
      </div>
    );
  }
  return (
    <ModelCombobox
      value={value}
      onChange={onChange}
      options={models}
      placeholder="输入或选择模型名称"
    />
  );
}
