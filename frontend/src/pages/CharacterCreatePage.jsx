import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createCharacter } from '../api/characters';
import MarkdownEditor from '../components/ui/MarkdownEditor';

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

        <h1 className="text-2xl font-serif font-semibold text-text tracking-tight mb-8">创建角色</h1>

        {/* 表单 */}
        <div className="flex flex-col gap-5">
          <div>
            <label className="block text-sm text-text-secondary mb-1.5">名称 <span className="text-red-400">*</span></label>
            <input
              className="w-full px-3 py-2.5 bg-ivory border border-border rounded-lg text-text text-sm focus:outline-none focus:border-accent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="角色的名字"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">System Prompt</label>
            <MarkdownEditor
              value={systemPrompt}
              onChange={setSystemPrompt}
              placeholder="角色的性格、背景、说话风格……"
              minHeight={144}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">
              后置提示词
              <span className="text-text-secondary opacity-40 ml-1.5 text-xs">插入在用户消息之后，作为 user 角色发送</span>
            </label>
            <MarkdownEditor
              value={postPrompt}
              onChange={setPostPrompt}
              placeholder="每次对话附加的角色级指令，例如特定的回复格式……"
              minHeight={72}
            />
          </div>

          <div>
            <label className="block text-sm text-text-secondary mb-1.5">开场白</label>
            <MarkdownEditor
              value={firstMessage}
              onChange={setFirstMessage}
              placeholder="角色在对话开始时主动说的第一句话，留空则由用户先开口"
              minHeight={96}
            />
          </div>

          {saveError && <p className="text-sm text-red-400">{saveError}</p>}

          <div className="flex justify-end pt-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-accent text-white text-sm rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {saving ? '创建中…' : '创建角色'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
