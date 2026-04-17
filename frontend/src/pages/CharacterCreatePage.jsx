import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createCharacter } from '../api/characters';
import MarkdownEditor from '../components/ui/MarkdownEditor';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';

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
    <div className="we-edit-canvas">
      <div className="we-edit-panel">
        <div className="we-edit-header">
          <button className="we-edit-back" onClick={() => navigate(-1)}>← 返回</button>
          <h1 className="we-edit-title">新建角色</h1>
        </div>

        <div className="we-edit-form-stack">
          <div className="we-edit-form-group">
            <label className="we-edit-label">
              名称 <span style={{ color: 'var(--we-vermilion)' }}>*</span>
            </label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="角色的名字"
              autoFocus
            />
          </div>

          <div className="we-edit-form-group">
            <label className="we-edit-label">System Prompt</label>
            <MarkdownEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              placeholder="角色的性格、背景、说话风格……"
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
              placeholder="每次对话附加的角色级指令，例如特定的回复格式……"
              minHeight={72}
            />
          </div>

          <div className="we-edit-form-group">
            <label className="we-edit-label">开场白</label>
            <MarkdownEditor
              value={firstMessage}
              onChange={setFirstMessage}
              placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口"
              minHeight={96}
            />
          </div>

          {saveError && <p className="we-edit-error">{saveError}</p>}

          <div className="we-edit-save-row">
            <Button variant="primary" onClick={handleSave} disabled={saving}>
              {saving ? '创建中…' : '创建角色'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
