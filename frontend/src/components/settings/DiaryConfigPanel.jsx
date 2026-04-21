import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';
import FieldLabel from './FieldLabel';

export default function DiaryConfigPanel({
  settingsMode, onModeChange,
  chatEnabled, onToggleChatEnabled,
  chatDateMode, onChangeChatDateMode,
  writingEnabled, onToggleWritingEnabled,
  writingDateMode, onChangeWritingDateMode,
}) {
  const isChat = settingsMode === 'chat';
  const enabled = isChat ? chatEnabled : writingEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onToggle = isChat ? onToggleChatEnabled : onToggleWritingEnabled;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;

  return (
    <div>
      <h2 className="we-settings-section-title">日记</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      <div className="we-settings-field-group" style={{ marginTop: 16 }}>
        <div className="we-edit-form-group">
          <FieldLabel hint="开启后世界状态将自动添加时间字段，AI 每轮更新后判断日期跨越并生成日记">
            {isChat ? '对话空间日记' : '写作空间日记'}
          </FieldLabel>
          <ToggleSwitch checked={enabled} onChange={onToggle} />
        </div>

        {enabled && (
          <div className="we-edit-form-group">
            <FieldLabel hint="虚拟日期：解析世界状态时间字段中的"N年N月N日"；真实日期：使用系统时间。切换仅影响新建会话。">
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
      </div>

      <p style={{
        marginTop: 16,
        fontSize: 12,
        fontStyle: 'italic',
        color: 'var(--we-ink-faded)',
        fontFamily: 'var(--we-font-serif)',
        lineHeight: 1.6,
      }}>
        开启后，AI 每轮回复结束后会异步检测日期跨越，并为前一日生成一篇 Markdown 日记。右侧面板 Timeline 将展示日记摘要，点击可注入下轮上下文。
      </p>
    </div>
  );
}
