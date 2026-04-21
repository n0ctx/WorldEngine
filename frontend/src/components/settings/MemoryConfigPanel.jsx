import { useState } from 'react';
import ToggleSwitch from '../ui/ToggleSwitch';
import ModeSwitch from './ModeSwitch';
import { SETTINGS_MODE, DIARY_DATE_MODE } from './SettingsConstants';
import { clearAllDiaries } from '../../api/world-state-fields';

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

function DiaryDisableConfirm({ diaryLabel, onConfirm, onClose }) {
  const [loading, setLoading] = useState(false);
  async function handle() {
    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60">
      <div className="we-dialog-panel w-full max-w-sm mx-4" style={{ padding: '24px' }}>
        <h2 style={{ fontFamily: 'var(--we-font-display)', fontSize: '17px', fontWeight: 400, fontStyle: 'italic', color: 'var(--we-ink-primary)', marginBottom: '10px' }}>
          关闭{diaryLabel}
        </h2>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-secondary)', marginBottom: '6px' }}>
          关闭后将删除所有已生成的日记记录（包括数据库条目和本地文件），此操作不可撤销。
        </p>
        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-vermilion)', marginBottom: '20px' }}>
          确认要继续吗？
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={onClose} disabled={loading} className="we-btn we-btn-sm we-btn-secondary">取消</button>
          <button onClick={handle} disabled={loading} className="we-btn we-btn-sm we-btn-danger">
            {loading ? '处理中…' : '确认关闭并删除'}
          </button>
        </div>
      </div>
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

      <div style={{ marginTop: 20 }}>
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
          <div style={{ marginTop: -12, marginBottom: 24, paddingLeft: 0 }}>
            <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: 13, color: 'var(--we-ink-secondary)', margin: '0 0 8px' }}>
              日期模式
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: DIARY_DATE_MODE.VIRTUAL, label: '虚拟日期', hint: '解析世界状态时间字段' },
                { value: DIARY_DATE_MODE.REAL, label: '真实日期', hint: '使用系统时间' },
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

      {confirmPending && (
        <DiaryDisableConfirm
          diaryLabel={diaryLabel}
          onConfirm={handleConfirmDisable}
          onClose={() => setConfirmPending(false)}
        />
      )}
    </div>
  );
}
