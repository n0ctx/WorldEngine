import Input from '../ui/Input';
import Button from '../ui/Button';
import MarkdownEditor from '../ui/MarkdownEditor';
import ModeSwitch from './ModeSwitch';
import FormGroup from '../ui/FormGroup';
import { SETTINGS_MODE } from './SettingsConstants';

export default function PromptConfigPanel({
  settingsMode, onModeChange,
  globalSystemPrompt, setGlobalSystemPrompt,
  globalPostPrompt, setGlobalPostPrompt,
  contextRounds, setContextRounds,
  onSave, saving,
  writingSystemPrompt, setWritingSystemPrompt,
  writingPostPrompt, setWritingPostPrompt,
  writingContextRounds, setWritingContextRounds,
  onSaveWriting,
}) {
  return (
    <div>
      <h2 className="we-settings-section-title">全局提示词</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      {settingsMode === SETTINGS_MODE.WRITING ? (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="写作上下文保留轮次" hint="null = 继承对话配置，0 = 不限制">
              <div className="we-settings-inline-field">
                <Input
                  type="number"
                  min={0}
                  className="we-settings-number-short"
                  value={writingContextRounds ?? ''}
                  placeholder="继承对话"
                  onChange={(e) => setWritingContextRounds(e.target.value === '' ? null : e.target.value)}
                />
                <span className="we-settings-inline-hint">
                  留空继承对话配置，0 = 不限制
                </span>
              </div>
            </FormGroup>

            <FormGroup label="写作系统提示词">
              <MarkdownEditor
                value={writingSystemPrompt}
                onChange={setWritingSystemPrompt}
                placeholder="写作空间专用全局指令，覆盖对话系统提示词"
                minHeight={96}
              />
            </FormGroup>

            <FormGroup label="写作后置提示词" hint="插入在用户消息之后，作为 user 角色发送">
              <MarkdownEditor
                value={writingPostPrompt}
                onChange={setWritingPostPrompt}
                placeholder="写作空间专用后置提示词"
                minHeight={72}
              />
            </FormGroup>
          </div>

          <div className="we-settings-save-row">
            <Button variant="primary" onClick={onSaveWriting} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="上下文保留轮次" hint="0 = 不限制">
              <div className="we-settings-inline-field">
                <Input
                  type="number"
                  min={0}
                  className="we-settings-number-short"
                  value={contextRounds}
                  onChange={(e) => setContextRounds(e.target.value)}
                />
                <span className="we-settings-inline-hint">
                  保留最近 N 轮，0 = 不限制
                </span>
              </div>
            </FormGroup>

            <FormGroup label="全局系统提示词">
              <MarkdownEditor
                value={globalSystemPrompt}
                onChange={setGlobalSystemPrompt}
                placeholder="适用于所有世界和角色的全局指令"
                minHeight={96}
              />
            </FormGroup>

            <FormGroup label="全局后置提示词" hint="插入在用户消息之后，作为 user 角色发送">
              <MarkdownEditor
                value={globalPostPrompt}
                onChange={setGlobalPostPrompt}
                placeholder="每次用户发送消息后附加的全局指令，例如输出格式要求"
                minHeight={72}
              />
            </FormGroup>
          </div>

          <div className="we-settings-save-row">
            <Button variant="primary" onClick={onSave} disabled={saving}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
