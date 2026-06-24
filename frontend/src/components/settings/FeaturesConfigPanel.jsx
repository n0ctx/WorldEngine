import ToggleSwitch from '../ui/ToggleSwitch';
import Input from '../ui/Input';
import FormGroup from '../ui/FormGroup';
import { SETTINGS_MODE, DIARY_DATE_MODE, TABLE_MEMORY_TABLES } from '../../core/constants/settings';

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
  settingsMode,
  contextRounds, setContextRounds, onSaveContextRounds,
  writingContextRounds, setWritingContextRounds, onSaveWritingContextRounds,
  chapterTurnSize, setChapterTurnSize, onSaveChapterTurnSize,
  writingChapterTurnSize, setWritingChapterTurnSize, onSaveWritingChapterTurnSize,
  pageTurnSize, setPageTurnSize, onSavePageTurnSize,
  writingPageTurnSize, setWritingPageTurnSize, onSaveWritingPageTurnSize,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  longTermMemoryEnabled, onToggleLongTermMemory,
  writingLongTermMemoryEnabled, onToggleWritingLongTermMemory,
  tableMemoryEnabled, onToggleTableMemory,
  writingTableMemoryEnabled, onToggleWritingTableMemory,
  tableMemoryRowLimits, setTableMemoryRowLimits, onSaveTableMemoryRowLimit,
  memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
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
  const ltmEnabledCurrent = isChat ? longTermMemoryEnabled : writingLongTermMemoryEnabled;
  const onToggleLtmCurrent = isChat ? onToggleLongTermMemory : onToggleWritingLongTermMemory;
  const tableMemoryEnabledCurrent = isChat ? tableMemoryEnabled : writingTableMemoryEnabled;
  const onToggleTableMemoryCurrent = isChat ? onToggleTableMemory : onToggleWritingTableMemory;
  const diaryEnabled = isChat ? chatDiaryEnabled : writingDiaryEnabled;
  const onToggleDiary = isChat ? onToggleChatDiaryEnabled : onToggleWritingDiaryEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;
  const suggestionEnabledCurrent = isChat ? suggestionEnabled : writingSuggestionEnabled;
  const onToggleSuggestionCurrent = isChat ? onToggleSuggestion : onToggleWritingSuggestion;

  const currentContextRounds = isChat ? contextRounds : (writingContextRounds ?? '');
  const onChangeContextRounds = isChat
    ? (e) => setContextRounds(e.target.value)
    : (e) => setWritingContextRounds(e.target.value === '' ? null : e.target.value);
  const onBlurContextRounds = isChat
    ? () => onSaveContextRounds(contextRounds)
    : () => onSaveWritingContextRounds(writingContextRounds);

  const currentChapterTurnSize = isChat ? chapterTurnSize : (writingChapterTurnSize ?? '');
  const onChangeChapterTurnSize = isChat
    ? (e) => setChapterTurnSize(e.target.value)
    : (e) => setWritingChapterTurnSize(e.target.value === '' ? null : e.target.value);
  const onBlurChapterTurnSize = isChat
    ? () => onSaveChapterTurnSize(chapterTurnSize)
    : () => onSaveWritingChapterTurnSize(writingChapterTurnSize);

  const currentPageTurnSize = isChat ? pageTurnSize : (writingPageTurnSize ?? '');
  const onChangePageTurnSize = isChat
    ? (e) => setPageTurnSize(e.target.value)
    : (e) => setWritingPageTurnSize(e.target.value === '' ? null : e.target.value);
  const onBlurPageTurnSize = isChat
    ? () => onSavePageTurnSize(pageTurnSize)
    : () => onSaveWritingPageTurnSize(writingPageTurnSize);

  return (
    <div>
      <h2 className="we-settings-section-title">功能配置</h2>

      <div className="we-settings-section-body">
        <p className="we-settings-subsection-title">记忆</p>

        <div className="we-settings-field-group">
          <FormGroup
            label={isChat ? '上下文保留轮次' : '写作上下文保留轮次'}
            hint={isChat ? '0 = 不限制' : '留空继承对话配置，0 = 不限制'}
            variant="settings"
          >
            <div className="we-settings-inline-field">
              <Input
                type="number"
                min={0}
                className="we-settings-number-short"
                value={currentContextRounds}
                placeholder={isChat ? '' : '继承对话'}
                onChange={onChangeContextRounds}
                onBlur={onBlurContextRounds}
              />
              <span className="we-settings-inline-hint">
                {isChat ? '保留最近 N 轮，0 = 不限制' : '留空继承对话配置，0 = 不限制'}
              </span>
            </div>
          </FormGroup>
        </div>

        <div className="we-settings-field-group">
          <FormGroup
            label="召回条目数量上限"
            hint="向量召回历史 turn 摘要时返回的最大条数（topK），实际注入仍受 token 预算约束"
            variant="settings"
          >
            <div className="we-settings-inline-field">
              <Input
                type="number"
                min={1}
                className="we-settings-number-short"
                value={memoryRecallMaxSessions ?? ''}
                onChange={(e) => setMemoryRecallMaxSessions(e.target.value === '' ? '' : Number(e.target.value))}
                onBlur={() => onSaveMemoryRecallMaxSessions(memoryRecallMaxSessions)}
              />
              <span className="we-settings-inline-hint">最多召回 N 条，默认 5</span>
            </div>
          </FormGroup>
        </div>

        <ToggleRow
          label="记忆原文展开"
          hint="召回历史摘要后允许 AI 读取原文，会略增加首包延迟"
          checked={expansionEnabled}
          onChange={onToggleExpansion}
        />

        <ToggleRow
          label="长期记忆"
          hint="每轮自动抽取关键事实写入长期记忆并注入提示词；关闭仅停止产出与注入，已有内容保留"
          checked={ltmEnabledCurrent}
          onChange={onToggleLtmCurrent}
        />

        <ToggleRow
          label="表格记忆"
          hint="每轮自动维护关系/物品/地点/剧情线/势力/资源 6 张表并注入提示词；关闭仅停止更新与注入，已有表格保留"
          checked={tableMemoryEnabledCurrent}
          onChange={onToggleTableMemoryCurrent}
        />

        {tableMemoryEnabledCurrent && (
          <div className="we-settings-field-group">
            <p className="we-settings-toggle-hint we-settings-rowlimit-hint">
              每张表的行数上限（0 = 不限制，对话与写作共用）。表满后 AI 新增前会先归档最不重要的旧行；若 AI 未归档，系统兜底归档最旧的行。
            </p>
            {TABLE_MEMORY_TABLES.map(({ key, name }) => (
              <div key={key} className="we-settings-inline-field we-settings-rowlimit-item">
                <span className="we-settings-toggle-label we-settings-rowlimit-label">{name}</span>
                <Input
                  type="number"
                  min={0}
                  max={1000}
                  className="we-settings-number-short"
                  value={tableMemoryRowLimits?.[key] ?? ''}
                  onChange={(e) => setTableMemoryRowLimits((prev) => ({
                    ...prev,
                    [key]: e.target.value === '' ? '' : Number(e.target.value),
                  }))}
                  onBlur={() => onSaveTableMemoryRowLimit(key, tableMemoryRowLimits?.[key])}
                />
                <span className="we-settings-inline-hint">行，0 = 不限制</span>
              </div>
            ))}
          </div>
        )}

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

        {!isChat && (
          <>
            <hr className="we-settings-divider" />

            <p className="we-settings-subsection-title">分章</p>

            <div className="we-settings-field-group">
              <FormGroup
                label="写作每章轮数"
                hint="按 N 轮（user + assistant）切一章；仅影响章节分组，不影响翻页"
                variant="settings"
              >
                <div className="we-settings-inline-field">
                  <Input
                    type="number"
                    min={1}
                    className="we-settings-number-short"
                    value={currentChapterTurnSize}
                    onChange={onChangeChapterTurnSize}
                    onBlur={onBlurChapterTurnSize}
                  />
                  <span className="we-settings-inline-hint">每 N 轮一章</span>
                </div>
              </FormGroup>
            </div>
          </>
        )}

        <hr className="we-settings-divider" />

        <p className="we-settings-subsection-title">翻页</p>

        <div className="we-settings-field-group">
          <FormGroup
            label={isChat ? '每页轮数' : '写作每页轮数'}
            hint={isChat
              ? '翻页条按 N 轮（user + assistant）切一页；仅控制翻页跳转，不影响分章'
              : '留空继承对话配置；仅控制翻页跳转'}
            variant="settings"
          >
            <div className="we-settings-inline-field">
              <Input
                type="number"
                min={1}
                className="we-settings-number-short"
                value={currentPageTurnSize}
                placeholder={isChat ? '' : '继承对话'}
                onChange={onChangePageTurnSize}
                onBlur={onBlurPageTurnSize}
              />
              <span className="we-settings-inline-hint">
                {isChat ? '每 N 轮一页' : '留空继承对话配置'}
              </span>
            </div>
          </FormGroup>
        </div>
      </div>
    </div>
  );
}
