import ToggleSwitch from '../ui/ToggleSwitch';
import Input from '../ui/Input';
import FormGroup from '../ui/FormGroup';
import { SETTINGS_MODE, DIARY_DATE_MODE, TABLE_MEMORY_TABLES } from '../../core/constants/settings';

const DIARY_DATE_OPTIONS = [
  { value: DIARY_DATE_MODE.VIRTUAL, label: '虚拟日期' },
  { value: DIARY_DATE_MODE.REAL, label: '真实日期' },
];

const DANMAKU_SPEED_OPTIONS = [
  { value: 'slow', label: '慢' },
  { value: 'normal', label: '中' },
  { value: 'fast', label: '快' },
];

/**
 * 对话/写作两套数字字段的输入框 props：写作侧留空表示继承对话配置（存为 null），失焦时保存
 * chat / writing 各为 [当前值, 设置函数, 保存函数]
 */
function inheritableNumberInput(isChat, [chatValue, setChat, saveChat], [writingValue, setWriting, saveWriting]) {
  if (isChat) {
    return { value: chatValue, onChange: (event) => setChat(event.target.value), onBlur: () => saveChat(chatValue) };
  }
  return {
    value: writingValue ?? '',
    onChange: (event) => setWriting(event.target.value === '' ? null : event.target.value),
    onBlur: () => saveWriting(writingValue),
  };
}

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
      <ToggleSwitch checked={checked} onChange={onChange} disabled={disabled} />
    </div>
  );
}

function MemorySettings({
  settingsMode,
  shortTermTokenBudget, setShortTermTokenBudget, onSaveShortTermTokenBudget,
  writingShortTermTokenBudget, setWritingShortTermTokenBudget, onSaveWritingShortTermTokenBudget,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  tableMemoryEnabled, onToggleTableMemory,
  writingTableMemoryEnabled, onToggleWritingTableMemory,
  tableMemoryRowLimits, setTableMemoryRowLimits, onSaveTableMemoryRowLimit,
  memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
  longTermIndexBudget, setLongTermIndexBudget, onSaveLongTermIndexBudget,
  chatDiaryEnabled, onToggleChatDiaryEnabled,
  chatDateMode, onChangeChatDateMode,
  writingDiaryEnabled, onToggleWritingDiaryEnabled,
  writingDateMode, onChangeWritingDateMode,
}) {
  const isChat = settingsMode === SETTINGS_MODE.CHAT;
  const expansionEnabled = isChat ? memoryExpansionEnabled : writingMemoryExpansionEnabled;
  const onToggleExpansion = isChat ? onToggleMemoryExpansion : onToggleWritingMemoryExpansion;
  const tableMemoryEnabledCurrent = isChat ? tableMemoryEnabled : writingTableMemoryEnabled;
  const onToggleTableMemoryCurrent = isChat ? onToggleTableMemory : onToggleWritingTableMemory;
  const diaryEnabled = isChat ? chatDiaryEnabled : writingDiaryEnabled;
  const onToggleDiary = isChat ? onToggleChatDiaryEnabled : onToggleWritingDiaryEnabled;
  const dateMode = isChat ? chatDateMode : writingDateMode;
  const onDateMode = isChat ? onChangeChatDateMode : onChangeWritingDateMode;
  const shortTermTokenBudgetInput = inheritableNumberInput(
    isChat,
    [shortTermTokenBudget, setShortTermTokenBudget, onSaveShortTermTokenBudget],
    [writingShortTermTokenBudget, setWritingShortTermTokenBudget, onSaveWritingShortTermTokenBudget],
  );
  const shortTermTokenBudgetLabel = isChat ? '短期记忆 token 预算' : '写作短期记忆 token 预算';

  return (
    <>
      <p className="we-settings-subsection-title">记忆</p>

      <div className="we-settings-field-group">
        <FormGroup
          label={shortTermTokenBudgetLabel}
          hint={isChat ? '1000~200000' : '留空继承对话配置，1000~200000'}
          variant="settings"
        >
          <div className="we-settings-inline-field">
            <Input
              type="number"
              min={1000}
              max={200000}
              className="we-settings-number-short"
              aria-label={shortTermTokenBudgetLabel}
              {...shortTermTokenBudgetInput}
              placeholder={isChat ? '' : '继承对话'}
            />
            <span className="we-settings-inline-hint">
              {isChat ? '按 token 预算保留最近轮次原文，超出部分转入中期摘要' : '留空继承对话配置'}
            </span>
          </div>
        </FormGroup>
      </div>

      <div className="we-settings-field-group">
        <FormGroup
          label="每轮最多召回轮次"
          hint="长期召回时最多挑选的历史轮次数，实际注入仍受召回目录预算约束"
          variant="settings"
        >
          <div className="we-settings-inline-field">
            <Input
              type="number"
              min={1}
              className="we-settings-number-short"
              aria-label="每轮最多召回轮次"
              value={memoryRecallMaxSessions ?? ''}
              onChange={(event) => setMemoryRecallMaxSessions(event.target.value === '' ? '' : Number(event.target.value))}
              onBlur={() => onSaveMemoryRecallMaxSessions(memoryRecallMaxSessions)}
            />
            <span className="we-settings-inline-hint">最多召回 N 轮，默认 5</span>
          </div>
        </FormGroup>
      </div>

      <div className="we-settings-field-group">
        <FormGroup
          label="召回目录预算"
          hint="本地小上下文模型请调低；超出部分的早期轮次不参与召回"
          variant="settings"
        >
          <div className="we-settings-inline-field">
            <Input
              type="number"
              min={2000}
              max={500000}
              className="we-settings-number-short"
              aria-label="召回目录预算"
              value={longTermIndexBudget ?? ''}
              onChange={(event) => setLongTermIndexBudget(event.target.value === '' ? '' : Number(event.target.value))}
              onBlur={() => onSaveLongTermIndexBudget(longTermIndexBudget)}
            />
            <span className="we-settings-inline-hint">2000~500000</span>
          </div>
        </FormGroup>
      </div>

      <ToggleRow
        label="长期召回"
        hint="每轮生成前由辅助模型按历史目录挑选相关轮次原文，会增加首字等待"
        checked={expansionEnabled}
        onChange={onToggleExpansion}
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
                aria-label={name + '行数上限'}
                value={tableMemoryRowLimits?.[key] ?? ''}
                onChange={(event) => setTableMemoryRowLimits((previous) => ({
                  ...previous,
                  [key]: event.target.value === '' ? '' : Number(event.target.value),
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
          <p className="we-settings-date-label">日期模式</p>
          <div className="we-settings-date-options">
            {DIARY_DATE_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onDateMode(value)}
                className={`we-settings-date-option${dateMode === value ? ' we-settings-date-option--active' : ''}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="we-settings-date-hint">切换仅影响新建会话</p>
        </div>
      )}
    </>
  );
}

function ResponseSettings({
  showThinking, onToggleShowThinking,
  autoCollapseThinking, onToggleAutoCollapseThinking,
  showTokenUsage, onToggleShowTokenUsage,
  suggestionEnabled, onToggleSuggestion,
  writingSuggestionEnabled, onToggleWritingSuggestion,
  danmakuEnabled, onToggleDanmaku,
  danmakuCount, setDanmakuCount, onSaveDanmakuCount,
  danmakuSpeed, onChangeDanmakuSpeed,
  settingsMode,
}) {
  const isChat = settingsMode === SETTINGS_MODE.CHAT;
  const suggestionEnabledCurrent = isChat ? suggestionEnabled : writingSuggestionEnabled;
  const onToggleSuggestionCurrent = isChat ? onToggleSuggestion : onToggleWritingSuggestion;

  return (
    <>
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
      <p className="we-settings-subsection-title">弹幕</p>

      <ToggleRow
        label="弹幕"
        hint="每轮回复后由副模型生成几条「观众弹幕」，在输入框上方滚动飘过（纯特效，不保存，对话与写作共用）"
        checked={danmakuEnabled}
        onChange={onToggleDanmaku}
      />

      {danmakuEnabled && (
        <>
          <div className="we-settings-field-group">
            <FormGroup label="每轮弹幕条数" hint="建议 3–8 条" variant="settings">
              <div className="we-settings-inline-field">
                <Input
                  type="number"
                  min={1}
                  max={20}
                  className="we-settings-number-short"
                  aria-label="每轮弹幕条数"
                  value={danmakuCount ?? ''}
                  onChange={(event) => setDanmakuCount(event.target.value === '' ? '' : Number(event.target.value))}
                  onBlur={() => onSaveDanmakuCount(danmakuCount)}
                />
                <span className="we-settings-inline-hint">条，1–20</span>
              </div>
            </FormGroup>
          </div>

          <div className="we-settings-date-mode">
            <p className="we-settings-date-label">滚动速度</p>
            <div className="we-settings-date-options">
              {DANMAKU_SPEED_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => onChangeDanmakuSpeed(value)}
                  className={`we-settings-date-option${danmakuSpeed === value ? ' we-settings-date-option--active' : ''}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      <hr className="we-settings-divider" />
      <p className="we-settings-subsection-title">选项</p>

      <ToggleRow
        label={isChat ? '对话选项' : '写作选项'}
        hint="开启后 AI 回复末尾生成选项卡，供选择下一步行动"
        checked={suggestionEnabledCurrent}
        onChange={onToggleSuggestionCurrent}
      />
    </>
  );
}

function TurnSettings({
  settingsMode,
  chapterTurnSize, setChapterTurnSize, onSaveChapterTurnSize,
  writingChapterTurnSize, setWritingChapterTurnSize, onSaveWritingChapterTurnSize,
  pageTurnSize, setPageTurnSize, onSavePageTurnSize,
  writingPageTurnSize, setWritingPageTurnSize, onSaveWritingPageTurnSize,
}) {
  const isChat = settingsMode === SETTINGS_MODE.CHAT;
  const chapterTurnSizeInput = inheritableNumberInput(
    isChat,
    [chapterTurnSize, setChapterTurnSize, onSaveChapterTurnSize],
    [writingChapterTurnSize, setWritingChapterTurnSize, onSaveWritingChapterTurnSize],
  );
  const pageTurnSizeInput = inheritableNumberInput(
    isChat,
    [pageTurnSize, setPageTurnSize, onSavePageTurnSize],
    [writingPageTurnSize, setWritingPageTurnSize, onSaveWritingPageTurnSize],
  );
  const pageTurnSizeLabel = isChat ? '每页轮数' : '写作每页轮数';

  return (
    <>
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
                  aria-label="写作每章轮数"
                  {...chapterTurnSizeInput}
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
          label={pageTurnSizeLabel}
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
              aria-label={pageTurnSizeLabel}
              {...pageTurnSizeInput}
              placeholder={isChat ? '' : '继承对话'}
            />
            <span className="we-settings-inline-hint">
              {isChat ? '每 N 轮一页' : '留空继承对话配置'}
            </span>
          </div>
        </FormGroup>
      </div>
    </>
  );
}

export default function FeaturesConfigPanel({
  settingsMode,
  shortTermTokenBudget, setShortTermTokenBudget, onSaveShortTermTokenBudget,
  writingShortTermTokenBudget, setWritingShortTermTokenBudget, onSaveWritingShortTermTokenBudget,
  chapterTurnSize, setChapterTurnSize, onSaveChapterTurnSize,
  writingChapterTurnSize, setWritingChapterTurnSize, onSaveWritingChapterTurnSize,
  pageTurnSize, setPageTurnSize, onSavePageTurnSize,
  writingPageTurnSize, setWritingPageTurnSize, onSaveWritingPageTurnSize,
  memoryExpansionEnabled, onToggleMemoryExpansion,
  writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
  tableMemoryEnabled, onToggleTableMemory,
  writingTableMemoryEnabled, onToggleWritingTableMemory,
  tableMemoryRowLimits, setTableMemoryRowLimits, onSaveTableMemoryRowLimit,
  memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
  longTermIndexBudget, setLongTermIndexBudget, onSaveLongTermIndexBudget,
  chatDiaryEnabled, onToggleChatDiaryEnabled,
  chatDateMode, onChangeChatDateMode,
  writingDiaryEnabled, onToggleWritingDiaryEnabled,
  writingDateMode, onChangeWritingDateMode,
  showThinking, onToggleShowThinking,
  autoCollapseThinking, onToggleAutoCollapseThinking,
  showTokenUsage, onToggleShowTokenUsage,
  suggestionEnabled, onToggleSuggestion,
  writingSuggestionEnabled, onToggleWritingSuggestion,
  danmakuEnabled, onToggleDanmaku,
  danmakuCount, setDanmakuCount, onSaveDanmakuCount,
  danmakuSpeed, onChangeDanmakuSpeed,
}) {
  const memorySettings = {
    settingsMode,
    shortTermTokenBudget, setShortTermTokenBudget, onSaveShortTermTokenBudget,
    writingShortTermTokenBudget, setWritingShortTermTokenBudget, onSaveWritingShortTermTokenBudget,
    memoryExpansionEnabled, onToggleMemoryExpansion,
    writingMemoryExpansionEnabled, onToggleWritingMemoryExpansion,
    tableMemoryEnabled, onToggleTableMemory,
    writingTableMemoryEnabled, onToggleWritingTableMemory,
    tableMemoryRowLimits, setTableMemoryRowLimits, onSaveTableMemoryRowLimit,
    memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
    longTermIndexBudget, setLongTermIndexBudget, onSaveLongTermIndexBudget,
    chatDiaryEnabled, onToggleChatDiaryEnabled,
    chatDateMode, onChangeChatDateMode,
    writingDiaryEnabled, onToggleWritingDiaryEnabled,
    writingDateMode, onChangeWritingDateMode,
  };
  const responseSettings = {
    showThinking, onToggleShowThinking,
    autoCollapseThinking, onToggleAutoCollapseThinking,
    showTokenUsage, onToggleShowTokenUsage,
    suggestionEnabled, onToggleSuggestion,
    writingSuggestionEnabled, onToggleWritingSuggestion,
    danmakuEnabled, onToggleDanmaku,
    danmakuCount, setDanmakuCount, onSaveDanmakuCount,
    danmakuSpeed, onChangeDanmakuSpeed,
    settingsMode,
  };
  const turnSettings = {
    settingsMode,
    chapterTurnSize, setChapterTurnSize, onSaveChapterTurnSize,
    writingChapterTurnSize, setWritingChapterTurnSize, onSaveWritingChapterTurnSize,
    pageTurnSize, setPageTurnSize, onSavePageTurnSize,
    writingPageTurnSize, setWritingPageTurnSize, onSaveWritingPageTurnSize,
  };

  return (
    <div>
      <h2 className="we-settings-section-title">功能配置</h2>
      <div className="we-settings-section-body">
        <MemorySettings {...memorySettings} />
        <ResponseSettings {...responseSettings} />
        <TurnSettings {...turnSettings} />
      </div>
    </div>
  );
}
