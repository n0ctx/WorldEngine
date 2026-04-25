import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';
import { SETTINGS_MODE, DIARY_DATE_MODE } from './SettingsConstants';

function ToggleRow({ label, hint, checked, onChange, disabled = false }) {
  return (
    <div className={`we-settings-toggle-row${disabled ? ' we-settings-toggle-row--disabled' : ''}`}>
      <div>
        <p className="we-settings-toggle-label">
          {label}
        </p>
        {hint && (
          <p className="we-settings-toggle-hint">
            {hint}
          </p>
        )}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

export default function FeaturesConfigPanel({
  settingsMode, onModeChange,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  chatDiaryEnabled, onToggleChatDiaryEnabled,
  chatDateMode, onChangeChatDateMode,
  writingDiaryEnabled, onToggleWritingDiaryEnabled,
  writingDateMode, onChangeWritingDateMode,
  showThinking, onToggleShowThinking,
  autoCollapseThinking, onToggleAutoCollapseThinking,
  showTokenUsage, onToggleShowTokenUsage,
  suggestionEnabled, onToggleSuggestion,
  writingSuggestionEnabled, onToggleWritingSuggestion,
}) {
  const isChat = settingsMode === SETTINGS_MODE.CHAT;
  const expansionEnabled = isChat ? memoryExpansionEnabled : writingMemoryExpansionEnabled;
  const onToggleExpansion = isChat ? onToggleMemoryExpansion : onToggleWritingMemoryExpansion;
  const diaryEnabled = isChat ? chatDiaryEnabled : writingDiaryEnabled;
  const onToggleDiary = isChat ? onToggleChatDiaryEnabled : onToggleWritingDiaryEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;
  const suggestionEnabledCurrent = isChat ? suggestionEnabled : writingSuggestionEnabled;
  const onToggleSuggestionCurrent = isChat ? onToggleSuggestion : onToggleWritingSuggestion;

  return (
    <div>
      <h2 className="we-settings-section-title">功能配置</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      <div className="we-settings-section-body">
        <p className="we-settings-subsection-title">记忆</p>

        <ToggleRow
          label="记忆原文展开"
          hint="召回历史摘要后允许 AI 读取原文，会略增加首包延迟"
          checked={expansionEnabled}
          onChange={onToggleExpansion}
        />

        <hr className="we-settings-divider" />

        <ToggleRow
          label={isChat ? '对话日记' : '写作日记'}
          hint={isChat
            ? '开启后对话自动检测日期跨越并生成日记，右侧面板 Timeline 展示摘要'
            : '开启后写作自动检测日期跨越并生成日记，右侧面板 Timeline 展示摘要'}
          checked={diaryEnabled}
          onChange={onToggleDiary}
        />

        {diaryEnabled && (
          <div className="we-settings-date-mode">
            <p className="we-settings-date-label">
              日期模式
            </p>
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
            <p className="we-settings-date-hint">
              切换仅影响新建会话
            </p>
          </div>
        )}

        <hr className="we-settings-divider" />

        <p className="we-settings-subsection-title">思维链</p>

        <ToggleRow
          label="渲染思维链"
          hint="显示 <think> 标签内容（可折叠），对话与写作均生效；关闭则完全屏蔽"
          checked={showThinking}
          onChange={onToggleShowThinking}
        />

        <ToggleRow
          label="自动折叠"
          hint="思考完成后默认折叠；关闭则默认展开"
          checked={autoCollapseThinking}
          onChange={onToggleAutoCollapseThinking}
          disabled={!showThinking}
        />

        <hr className="we-settings-divider" />

        <p className="we-settings-subsection-title">Token 消耗</p>

        <ToggleRow
          label="显示 token 消耗"
          hint="在每条 AI 回复底部显示本轮 token 用量，含缓存命中/写入统计（仅 Anthropic 模型）"
          checked={showTokenUsage}
          onChange={onToggleShowTokenUsage}
        />

        <hr className="we-settings-divider" />

        <p className="we-settings-subsection-title">选项</p>

        <ToggleRow
          label={isChat ? '对话选项' : '写作选项'}
          hint="开启后 AI 回复末尾生成选项卡，供选择下一步行动"
          checked={suggestionEnabledCurrent}
          onChange={onToggleSuggestionCurrent}
        />
      </div>
    </div>
  );
}
