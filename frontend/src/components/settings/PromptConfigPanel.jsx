import Button from '../ui/Button';
import MarkdownEditor from '../ui/MarkdownEditor';
import ModeSwitch from './ModeSwitch';
import FormGroup from '../ui/FormGroup';
import { SETTINGS_MODE } from './SettingsConstants';

export default function PromptConfigPanel({
  settingsMode, onModeChange,
  globalSystemPrompt, setGlobalSystemPrompt,
  globalPostPrompt, setGlobalPostPrompt,
  onSave, saving, saved,
  savingWriting, savedWriting,
  writingSystemPrompt, setWritingSystemPrompt,
  writingPostPrompt, setWritingPostPrompt,
  onSaveWriting,
}) {
  return (
    <div>
      <h2 className="we-settings-section-title">全局提示词</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      {settingsMode === SETTINGS_MODE.WRITING ? (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="写作系统提示词">
              <MarkdownEditor
                value={writingSystemPrompt}
                onChange={setWritingSystemPrompt}
                placeholder="写作专用全局指令，覆盖对话系统提示词"
                minHeight={96}
              />
            </FormGroup>

            <FormGroup label="写作后置提示词" hint="作为独立 system prompt 注入在当前 user message 前">
              <MarkdownEditor
                value={writingPostPrompt}
                onChange={setWritingPostPrompt}
                placeholder="写作专用后置提示词"
                minHeight={72}
              />
            </FormGroup>
          </div>

          <div className="we-settings-save-row">
            <Button variant="primary" onClick={onSaveWriting} disabled={savingWriting}>
              {savingWriting ? '保存中…' : savedWriting ? '已保存' : '保存'}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="全局系统提示词">
              <MarkdownEditor
                value={globalSystemPrompt}
                onChange={setGlobalSystemPrompt}
                placeholder="适用于所有世界和角色的全局指令"
                minHeight={96}
              />
            </FormGroup>

            <FormGroup label="全局后置提示词" hint="作为独立 system prompt 注入在当前 user message 前">
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
              {saving ? '保存中…' : saved ? '已保存' : '保存'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
