import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorld } from '../api/worlds';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

export default function WorldCreatePage() {
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  async function handleSave() {
    if (!name.trim()) {
      setSaveError('名称为必填项');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const world = await createWorld({
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
      });
      navigate(`/worlds/${world.id}/edit`, { replace: true });
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="we-edit-canvas">
      <div className="we-edit-panel">
        <div className="we-edit-header">
          <button className="we-edit-back" onClick={() => navigate(-1)}>← 返回</button>
          <h1 className="we-edit-title">新建世界</h1>
        </div>

        <div className="we-edit-form-stack">
          <div className="we-edit-form-group">
            <label className="we-edit-label">
              名称 <span style={{ color: 'var(--we-vermilion)' }}>*</span>
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="世界的名称"
              autoFocus
            />
          </div>

          <div className="we-edit-form-group">
            <label className="we-edit-label">世界 System Prompt</label>
            <MarkdownEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              placeholder="描述这个世界的背景、规则、氛围……"
              minHeight={144}
            />
          </div>

          <div className="we-edit-form-group">
            <label className="we-edit-label">
              后置提示词
              <span className="we-edit-label-hint">插入在用户消息之后，作为 user 角色发送</span>
            </label>
            <MarkdownEditor
              value={postPrompt}
              onChange={setPostPrompt}
              placeholder="每次对话附加的世界级指令，例如输出语言、格式要求……"
              minHeight={72}
            />
          </div>

          {saveError && <p className="we-edit-error">{saveError}</p>}

          <div className="we-edit-save-row">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '创建中…' : '创建世界'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
