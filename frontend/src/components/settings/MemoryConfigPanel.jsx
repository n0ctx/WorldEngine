import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
      <div>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 14, color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
          {label}
        </p>
        {hint && (
          <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 12, color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
            {hint}
          </p>
        )}
      </div>
      <ToggleSwitch checked={checked} onChange={onChange} />
    </div>
  );
}

export default function MemoryConfigPanel({
  settingsMode, onModeChange,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  chatDiaryEnabled, onToggleChatDiaryEnabled,
  chatDateMode, onChangeChatDateMode,
  writingDiaryEnabled, onToggleWritingDiaryEnabled,
  writingDateMode, onChangeWritingDateMode,
}) {
  const isChat = settingsMode === 'chat';
  const expansionEnabled = isChat ? memoryExpansionEnabled : writingMemoryExpansionEnabled;
  const onToggleExpansion = isChat ? onToggleMemoryExpansion : onToggleWritingMemoryExpansion;
  const diaryEnabled = isChat ? chatDiaryEnabled : writingDiaryEnabled;
  const onToggleDiary = isChat ? onToggleChatDiaryEnabled : onToggleWritingDiaryEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;

  return (
    <div>
      <h2 className="we-settings-section-title">记忆</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      <div style={{ marginTop: 20 }}>
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
            ? '开启后对话空间自动检测日期跨越并生成日记，右侧面板 Timeline 展示摘要'
            : '开启后写作空间自动检测日期跨越并生成日记，右侧面板 Timeline 展示摘要'}
          checked={diaryEnabled}
          onChange={onToggleDiary}
        />

        {diaryEnabled && (
          <div style={{ marginTop: -12, marginBottom: 24, paddingLeft: 0 }}>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 13, color: 'var(--we-ink-secondary)', margin: '0 0 8px' }}>
              日期模式
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'virtual', label: '虚拟日期', hint: '解析世界状态时间字段' },
                { value: 'real', label: '真实日期', hint: '使用系统时间' },
              ].map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onDateMode(value)}
                  style={{
                    padding: '4px 14px',
                    border: `1.5px solid ${dateMode === value ? 'var(--we-vermilion)' : 'var(--we-paper-shadow)'}`,
                    borderRadius: 'var(--we-radius-sm)',
                    background: dateMode === value ? 'var(--we-vermilion-bg)' : 'none',
                    color: dateMode === value ? 'var(--we-vermilion)' : 'var(--we-ink-secondary)',
                    fontFamily: 'var(--we-font-serif)',
                    fontSize: 13,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 12, color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: '6px 0 0' }}>
              切换仅影响新建会话
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
