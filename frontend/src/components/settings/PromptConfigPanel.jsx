import SectionTitle from '../ui/SectionTitle';
import MarkdownEditor from '../ui/MarkdownEditor';
import FormGroup from '../ui/FormGroup';
import SaveCapsule from '../ui/SaveCapsule';
import { SETTINGS_MODE } from '../../core/constants/settings';

export default function PromptConfigPanel({
  settingsMode,
  globalSystemPrompt, setGlobalSystemPrompt,
  globalPostPrompt, setGlobalPostPrompt,
  writingSystemPrompt, setWritingSystemPrompt,
  writingPostPrompt, setWritingPostPrompt,
  promptSave,
}) {
  return (
    <div>
      <SectionTitle level="section" rule="under" as="h2">全局提示词</SectionTitle>
      <p className="we-edit-hint we-edit-hint-settings">提示词改完要点底部浮起的「保存」才生效。</p>

      {settingsMode === SETTINGS_MODE.WRITING ? (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="写作系统提示词" variant="settings">
              <MarkdownEditor
                value={writingSystemPrompt}
                onChange={setWritingSystemPrompt}
                placeholder="写作专用全局指令，覆盖对话系统提示词"
                minHeight={96}
              />
            </FormGroup>

            <FormGroup label="写作后置提示词" hint="作为user prompt 注入在当前 user message 后" variant="settings">
              <MarkdownEditor
                value={writingPostPrompt}
                onChange={setWritingPostPrompt}
                placeholder="写作专用后置提示词"
                minHeight={72}
              />
            </FormGroup>
          </div>
        </>
      ) : (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="全局系统提示词" variant="settings">
              <MarkdownEditor
                value={globalSystemPrompt}
                onChange={setGlobalSystemPrompt}
                placeholder="适用于所有世界和角色的全局指令"
                minHeight={96}
              />
            </FormGroup>

            <FormGroup label="全局后置提示词" hint="作为user prompt 注入在当前 user message 后" variant="settings">
              <MarkdownEditor
                value={globalPostPrompt}
                onChange={setGlobalPostPrompt}
                placeholder="每次用户发送消息后附加的全局指令，例如输出格式要求"
                minHeight={72}
              />
            </FormGroup>
          </div>
        </>
      )}

      <SaveCapsule key={settingsMode} {...promptSave} saveLabel="保存" />
    </div>
  );
}
