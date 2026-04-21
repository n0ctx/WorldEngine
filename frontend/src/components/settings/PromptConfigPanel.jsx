import Input from '../ui/Input';
import Button from '../ui/Button';
import MarkdownEditor from '../ui/MarkdownEditor';
import EntryList from '../prompt/EntryList';
import ModeSwitch from './ModeSwitch';
import FieldLabel from './FieldLabel';
import ToggleSwitch from '../ui/ToggleSwitch';

export default function PromptConfigPanel({
  settingsMode, onModeChange,
  globalSystemPrompt, setGlobalSystemPrompt,
  globalPostPrompt, setGlobalPostPrompt,
  contextRounds, setContextRounds,
  suggestionEnabled, onToggleSuggestion,
  writingSuggestionEnabled, onToggleWritingSuggestion,
  onSave, saving,
  writingSystemPrompt, setWritingSystemPrompt,
  writingPostPrompt, setWritingPostPrompt,
  writingContextRounds, setWritingContextRounds,
  onSaveWriting,
}) {
  return (
    <div>
      <h2 className="we-settings-section-title">全局 Prompt</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      {settingsMode === 'writing' ? (
        <>
          <div className="we-settings-field-group">
            <div className="we-edit-form-group">
              <FieldLabel hint="null = 继承对话配置，0 = 不限制">写作上下文保留轮次</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Input
                  type="number"
                  min={0}
                  style={{ width: '96px' }}
                  value={writingContextRounds ?? ''}
                  placeholder="继承对话"
                  onChange={(e) => setWritingContextRounds(e.target.value === '' ? null : e.target.value)}
                />
                <span style={{ fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', fontFamily: 'var(--we-font-serif)' }}>
                  留空继承对话配置，0 = 不限制
                </span>
              </div>
            </div>

            <div className="we-edit-form-group">
              <FieldLabel>写作 System Prompt</FieldLabel>
              <MarkdownEditor
                value={writingSystemPrompt}
                onChange={setWritingSystemPrompt}
                placeholder="写作空间专用全局指令，覆盖对话 System Prompt"
                minHeight={96}
              />
            </div>

            <div className="we-edit-form-group">
              <FieldLabel hint="插入在用户消息之后，作为 user 角色发送">写作后置提示词</FieldLabel>
              <MarkdownEditor
                value={writingPostPrompt}
                onChange={setWritingPostPrompt}
                placeholder="写作空间专用后置提示词"
                minHeight={72}
              />
            </div>
          </div>

          <p className="we-edit-label">写作 Prompt 条目</p>
          <EntryList type="global" mode="writing" />

          <hr className="we-settings-divider" />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
            <div>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
                写作选项功能
              </p>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
                开启后 AI 回复末尾生成选项卡，供选择下一步行动
              </p>
            </div>
            <ToggleSwitch checked={writingSuggestionEnabled} onChange={onToggleWritingSuggestion} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
            <Button variant="primary" onClick={onSaveWriting} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="we-settings-field-group">
            <div className="we-edit-form-group">
              <FieldLabel hint="0 = 不限制">上下文保留轮次</FieldLabel>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Input
                  type="number"
                  min={0}
                  style={{ width: '96px' }}
                  value={contextRounds}
                  onChange={(e) => setContextRounds(e.target.value)}
                />
                <span style={{ fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', fontFamily: 'var(--we-font-serif)' }}>
                  保留最近 N 轮，0 = 不限制
                </span>
              </div>
            </div>

            <div className="we-edit-form-group">
              <FieldLabel>全局 System Prompt</FieldLabel>
              <MarkdownEditor
                value={globalSystemPrompt}
                onChange={setGlobalSystemPrompt}
                placeholder="适用于所有世界和角色的全局指令"
                minHeight={96}
              />
            </div>

            <div className="we-edit-form-group">
              <FieldLabel hint="插入在用户消息之后，作为 user 角色发送">全局后置提示词</FieldLabel>
              <MarkdownEditor
                value={globalPostPrompt}
                onChange={setGlobalPostPrompt}
                placeholder="每次用户发送消息后附加的全局指令，例如输出格式要求"
                minHeight={72}
              />
            </div>
          </div>

          <p className="we-edit-label">全局 Prompt 条目</p>
          <EntryList type="global" mode="chat" />

          <hr className="we-settings-divider" />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', marginBottom: '24px' }}>
            <div>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '14px', color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
                对话选项功能
              </p>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '12px', color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
                开启后 AI 回复末尾生成选项卡，供选择下一步行动
              </p>
            </div>
            <ToggleSwitch checked={suggestionEnabled} onChange={onToggleSuggestion} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <Button variant="primary" onClick={onSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
