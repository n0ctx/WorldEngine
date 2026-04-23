import { useState } from 'react';
import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';
import ConfirmModal from '../ui/ConfirmModal';
import { SETTINGS_MODE, DIARY_DATE_MODE } from './SettingsConstants';
import { clearAllDiaries } from '../../api/world-state-fields';

function ToggleRow({ label, hint, checked, onChange }) {
  return (
    <div className="we-settings-toggle-row">
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


export default function MemoryConfigPanel({
  settingsMode, onModeChange,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  chatDiaryEnabled, onToggleChatDiaryEnabled,
  chatDateMode, onChangeChatDateMode,
  writingDiaryEnabled, onToggleWritingDiaryEnabled,
  writingDateMode, onChangeWritingDateMode,
}) {
  const isChat = settingsMode === SETTINGS_MODE.CHAT;
  const expansionEnabled = isChat ? memoryExpansionEnabled : writingMemoryExpansionEnabled;
  const onToggleExpansion = isChat ? onToggleMemoryExpansion : onToggleWritingMemoryExpansion;
  const diaryEnabled = isChat ? chatDiaryEnabled : writingDiaryEnabled;
  const onToggleDiary = isChat ? onToggleChatDiaryEnabled : onToggleWritingDiaryEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;
  const diaryLabel = isChat ? '对话日记' : '写作日记';

  const [confirmPending, setConfirmPending] = useState(false);

  function handleDiaryToggle(enabled) {
    if (!enabled && diaryEnabled) {
      setConfirmPending(true);
    } else {
      onToggleDiary(enabled);
    }
  }

  async function handleConfirmDisable() {
    await onToggleDiary(false);
    await clearAllDiaries().catch(() => {});
    setConfirmPending(false);
  }

  return (
    <div>
      <h2 className="we-settings-section-title">记忆</h2>
      <ModeSwitch mode={settingsMode} onChange={onModeChange} />

      <div className="we-settings-section-body">
        <ToggleRow
          label="记忆原文展开"
          hint="召回历史摘要后允许 AI 读取原文，会略增加首包延迟"
          checked={expansionEnabled}
          onChange={onToggleExpansion}
        />

        <hr className="we-settings-divider" />

        <ToggleRow
          label={diaryLabel}
          hint={isChat
            ? '开启后对话空间自动检测日期跨越并生成日记，右侧面板 Timeline 展示摘要'
            : '开启后写作空间自动检测日期跨越并生成日记，右侧面板 Timeline 展示摘要'}
          checked={diaryEnabled}
          onChange={handleDiaryToggle}
        />

        {diaryEnabled && (
          <div className="we-settings-date-mode">
            <p className="we-settings-date-label">
              日期模式
            </p>
            <div className="we-settings-date-options">
              {[
                { value: DIARY_DATE_MODE.VIRTUAL, label: '虚拟日期', hint: '解析世界状态时间字段' },
                { value: DIARY_DATE_MODE.REAL, label: '真实日期', hint: '使用系统时间' },
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
      </div>

      {confirmPending && (
        <ConfirmModal
          title={`关闭${diaryLabel}`}
          message={
            <>
              <p className="we-settings-confirm-text">
                关闭后将删除所有已生成的日记记录（包括数据库条目和本地文件），此操作不可撤销。
              </p>
              <p className="we-settings-confirm-danger">
                确认要继续吗？
              </p>
            </>
          }
          confirmText="确认关闭并删除"
          danger={true}
          onConfirm={handleConfirmDisable}
          onClose={() => setConfirmPending(false)}
        />
      )}
    </div>
  );
}
