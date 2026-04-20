import { useState, useEffect } from 'react';
import Button from '../ui/Button';
import ModelCombobox from '../ui/ModelCombobox';

export default function ModelSelector({ value, onChange, loadModels }) {
  const [models, setModels] = useState([]);
  const [status, setStatus] = useState('idle');
  const [errMsg, setErrMsg] = useState('');

  async function load() {
    setStatus('loading');
    setErrMsg('');
    try {
      const data = await loadModels();
      const list = data.models || [];
      setModels(list);
      setStatus('ok');
      if (list.length > 0 && !value) {
        const first = list[0];
        onChange(typeof first === 'string' ? first : first.id);
      }
    } catch (e) {
      setErrMsg(e.message || '无法获取模型列表，请检查 API Key 和网络连接');
      setStatus('error');
    }
  }

  useEffect(() => { load(); }, []);

  if (status === 'loading') {
    return <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)' }}>获取模型列表中…</p>;
  }
  if (status === 'error') {
    return (
      <div>
        <p style={{ fontSize: '13px', color: 'var(--we-vermilion)', marginBottom: '6px' }}>{errMsg}</p>
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
