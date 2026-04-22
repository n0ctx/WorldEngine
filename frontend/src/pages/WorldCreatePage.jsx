import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorld } from '../api/worlds';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';

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
    <EditPageShell onClose={() => navigate(-1)} title="新建世界">
      <div className="we-edit-form-stack">
        <FormGroup label="名称" required>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="世界的名称"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="世界 System Prompt">
          <MarkdownEditor
            value={systemPrompt}
            onChange={setSystemPrompt}
            placeholder="描述这个世界的背景、规则、氛围……"
            minHeight={144}
          />
        </FormGroup>

        <FormGroup label="后置提示词" hint="插入在用户消息之后，作为 user 角色发送">
          <MarkdownEditor
            value={postPrompt}
            onChange={setPostPrompt}
            placeholder="每次对话附加的世界级指令，例如输出语言、格式要求……"
            minHeight={72}
          />
        </FormGroup>

        {saveError && <p className="we-edit-error">{saveError}</p>}

        <div className="we-edit-save-row">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '创建中…' : '创建世界'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
