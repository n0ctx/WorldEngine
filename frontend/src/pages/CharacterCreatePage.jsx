import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createCharacter } from '../api/characters';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import EditPageShell from '../components/ui/EditPageShell';
import FormGroup from '../components/ui/FormGroup';

export default function CharacterCreatePage() {
  const { worldId } = useParams();
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [postPrompt, setPostPrompt] = useState('');
  const [firstMessage, setFirstMessage] = useState('');
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
      const character = await createCharacter(worldId, {
        name: name.trim(),
        system_prompt: systemPrompt,
        post_prompt: postPrompt,
        first_message: firstMessage,
      });
      navigate(`/characters/${character.id}/edit`, { replace: true });
    } catch (e) {
      setSaveError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <EditPageShell onClose={() => navigate(-1)} title="新建角色">
      <div className="we-edit-form-stack">
        <FormGroup label="名称" required>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="角色的名字"
            autoFocus
          />
        </FormGroup>

        <FormGroup label="System Prompt">
          <MarkdownEditor
            value={systemPrompt}
            onChange={setSystemPrompt}
            placeholder="角色的性格、背景、说话风格……"
            minHeight={144}
          />
        </FormGroup>

        <FormGroup label="后置提示词" hint="插入在用户消息之后，作为 user 角色发送">
          <MarkdownEditor
            value={postPrompt}
            onChange={setPostPrompt}
            placeholder="每次对话附加的角色级指令，例如特定的回复格式……"
            minHeight={72}
          />
        </FormGroup>

        <FormGroup label="开场白">
          <MarkdownEditor
            value={firstMessage}
            onChange={setFirstMessage}
            placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口"
            minHeight={96}
          />
        </FormGroup>

        {saveError && <p className="we-edit-error">{saveError}</p>}

        <div className="we-edit-save-row">
          <Button variant="primary" onClick={handleSave} disabled={saving}>
            {saving ? '创建中…' : '创建角色'}
          </Button>
        </div>
      </div>
    </EditPageShell>
  );
}
