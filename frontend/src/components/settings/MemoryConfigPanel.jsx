import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';
import FieldLabel from './FieldLabel';

export default function MemoryConfigPanel({
  settingsMode, onModeChange,
  // 记忆原文展开
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  // 日记
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

      <div className="we-settings-field-group" style={{ marginTop: 16 }}>

        {/* 记忆原文展开 */}
        <div className="we-edit-form-group">
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
            <div>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 14, color: 'var(--we-ink-primary)', margin: '0 0 4px' }}>
                记忆原文展开
              </p>
              <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 12, color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>
                召回历史摘要后允许 AI 读取原文，会略增加首包延迟
              </p>
            </div>
            <ToggleSwitch checked={expansionEnabled} onChange={onToggleExpansion} />
          </div>
        </div>

        <hr className="we-settings-divider" />

        {/* 日记 */}
        <div className="we-edit-form-group">
          <FieldLabel hint={isChat ? '开启后对话空间自动检测日期跨越并生成日记' : '开启后写作空间自动检测日期跨越并生成日记'}>
            {isChat ? '对话日记' : '写作日记'}
          </FieldLabel>
          <ToggleSwitch checked={diaryEnabled} onChange={onToggleDiary} />
        </div>

        {diaryEnabled && (
          <div className="we-edit-form-group">
            <FieldLabel hint={'虚拟日期：解析世界状态时间字段中的"N年N月N日"；真实日期：使用系统时间。切换仅影响新建会话。'}>
              日期模式
            </FieldLabel>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'virtual', label: '虚拟日期' },
                { value: 'real', label: '真实日期' },
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
          </div>
        )}

        {diaryEnabled && (
          <p style={{
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--we-ink-faded)',
            fontFamily: 'var(--we-font-serif)',
            lineHeight: 1.6,
            margin: 0,
          }}>
            AI 每轮回复后异步检测日期跨越，为前一日生成 Markdown 日记。右侧面板 Timeline 展示日记摘要，点击可注入下轮上下文。
          </p>
        )}
      </div>
    </div>
  );
}
