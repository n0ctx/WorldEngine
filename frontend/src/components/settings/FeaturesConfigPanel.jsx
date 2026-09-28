import ToggleSwitch from '../ui/ToggleSwitch';
import Input from '../ui/Input';
import FormGroup from '../ui/FormGroup';
import { SETTINGS_MODE, DIARY_DATE_MODE } from '../../core/constants/settings';

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
  memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
  longTermIndexBudget, setLongTermIndexBudget, onSaveLongTermIndexBudget,
  stateInjectionTokenBudget, setStateInjectionTokenBudget, onSaveStateInjectionTokenBudget,
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

      <div className="we-settings-field-group">
        <FormGroup
          label="状态注入预算"
          hint="对话与写作共用"
          variant="settings"
        >
          <div className="we-settings-inline-field">
            <Input
              type="number"
              min={500}
              max={50000}
              className="we-settings-number-short"
              aria-label="状态注入预算"
              value={stateInjectionTokenBudget ?? ''}
              onChange={(event) => setStateInjectionTokenBudget(event.target.value === '' ? '' : Number(event.target.value))}
              onBlur={() => onSaveStateInjectionTokenBudget(stateInjectionTokenBudget)}
            />
            <span className="we-settings-inline-hint">
              每轮注入给模型的人物与事物设定上限（token）。超出时按相关度从后往前省略，人物身份与说话方式始终保留。
            </span>
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
        hint="显示 <think> 标签内容（可折叠）；关闭则完全屏蔽"
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
        hint="在每条 AI 回复底部显示本轮 token 用量；服务商返回缓存数据时一并显示缓存命中 / 写入，本地模型可能没有用量数据"
        checked={showTokenUsage}
        onChange={onToggleShowTokenUsage}
      />

      <hr className="we-settings-divider" />
      <p className="we-settings-subsection-title">弹幕</p>

      <ToggleRow
        label="弹幕"
        hint="每轮回复后由副模型生成几条「观众弹幕」，在输入框上方滚动飘过（纯特效，不保存）"
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
  memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
  longTermIndexBudget, setLongTermIndexBudget, onSaveLongTermIndexBudget,
  stateInjectionTokenBudget, setStateInjectionTokenBudget, onSaveStateInjectionTokenBudget,
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
    memoryRecallMaxSessions, setMemoryRecallMaxSessions, onSaveMemoryRecallMaxSessions,
    longTermIndexBudget, setLongTermIndexBudget, onSaveLongTermIndexBudget,
    stateInjectionTokenBudget, setStateInjectionTokenBudget, onSaveStateInjectionTokenBudget,
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
