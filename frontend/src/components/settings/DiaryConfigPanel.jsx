import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';
import FormGroup from '../ui/FormGroup';
import { SETTINGS_MODE, DIARY_DATE_MODE } from './SettingsConstants';

export default function DiaryConfigPanel({
  settingsMode, onModeChange,
  chatEnabled, onToggleChatEnabled,
  chatDateMode, onChangeChatDateMode,
  writingEnabled, onToggleWritingEnabled,
  writingDateMode, onChangeWritingDateMode,
}) {
  const isChat = settingsMode === SETTINGS_MODE.CHAT;
  const enabled = isChat ? chatEnabled : writingEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onToggle = isChat ? onToggleChatEnabled : onToggleWritingEnabled;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;

  return (
    <div>
      <h2 className="we-settings-section-title">日记</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      <div className="we-settings-field-group we-settings-field-group--spaced">
        <FormGroup
          label={isChat ? '对话日记' : '写作日记'}
          hint="开启后世界状态将自动添加时间字段，AI 每轮更新后判断日期跨越并生成日记"
        >
          <ToggleSwitch checked={enabled} onChange={onToggle} />
        </FormGroup>

        {enabled && (
          <FormGroup
            label="日期模式"
            hint={'虚拟日期：解析世界状态时间字段中的"N年N月N日"；真实日期：使用系统时间。切换仅影响新建会话。'}
          >
            <div className="we-settings-date-options">
              {[
                { value: DIARY_DATE_MODE.VIRTUAL, label: '虚拟日期' },
                { value: DIARY_DATE_MODE.REAL, label: '真实日期' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onDateMode(value)}
                  className={`we-settings-date-option${dateMode === value ? ' we-settings-date-option--active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </FormGroup>
        )}
      </div>

      <p className="we-settings-diary-note">
        开启后，AI 每轮回复结束后会异步检测日期跨越，并为前一日生成一篇 Markdown 日记。右侧面板 Timeline 将展示日记摘要，点击可注入下轮上下文。
      </p>
    </div>
  );
}
