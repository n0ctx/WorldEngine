import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSettingsConfig } from '../../core/hooks/useSettingsConfig';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import { useFocusTrap } from '../../core/hooks/useFocusTrap.js';
import LlmConfigPanel from '../../components/settings/LlmConfigPanel';
import PromptConfigPanel from '../../components/settings/PromptConfigPanel';
import ImportExportPanel from '../../components/settings/ImportExportPanel';
import AboutPanel from '../../components/settings/AboutPanel';
import ProviderSafetyPanel from '../../components/settings/ProviderSafetyPanel.jsx';
import ModeSwitch from '../../components/settings/ModeSwitch';
import CustomCssManager from '../../components/settings/CustomCssManager';
import RegexRulesManager from '../../components/settings/RegexRulesManager';
import FeaturesConfigPanel from '../../components/settings/FeaturesConfigPanel';
import ThemeManager from '../../components/settings/ThemeManager.jsx';
import MotionPackPicker from '../../components/settings/MotionPackPicker.jsx';
import { NAV_SECTIONS, NAV_KEY, SETTINGS_MODE } from '../../core/constants/settings';
import { useMotion } from '../../core/hooks/useMotion.js';
import BounceRail from '../../components/motion/BounceRail.jsx';
import ListItem from '../../components/ui/ListItem.jsx';
import SectionTitle from '../../components/ui/SectionTitle.jsx';

const SETTINGS_MODE_STORAGE_KEY = 'we:settings:mode';

function readPersistedSettingsMode() {
  try {
    const v = globalThis.localStorage?.getItem(SETTINGS_MODE_STORAGE_KEY);
    if (v === SETTINGS_MODE.CHAT || v === SETTINGS_MODE.WRITING) return v;
  } catch { /* ignore */ }
  return SETTINGS_MODE.CHAT;
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const m = useMotion();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const [activeSection, setActiveSection] = useState(NAV_SECTIONS[0].key);
  const [settingsMode, setSettingsModeState] = useState(readPersistedSettingsMode);
  const setSettingsMode = (mode) => {
    setSettingsModeState(mode);
    try { globalThis.localStorage?.setItem(SETTINGS_MODE_STORAGE_KEY, mode); } catch { /* ignore */ }
  };
  const { loading, llmProps, promptProps, diaryProps, onImportSuccess } = useSettingsConfig(settingsMode);
  const panelRef = useRef(null);
  const navItemsRef = useRef(null);
  const mouseDownOutsidePanel = useRef(false);
  useEscapeKey(() => navigate(-1), isOverlay);
  const onTab = useFocusTrap(panelRef, isOverlay);

  function handleBack() {
    if (isOverlay) { navigate(-1); return; }
    const from = location.state?.from;
    if (from?.pathname) {
      navigate(
        { pathname: from.pathname, search: from.search || '', hash: from.hash || '' },
        { state: from.state }
      );
      return;
    }
    navigate(-1);
  }

  const overlayHandlers = {
    onMouseDown: (e) => {
      mouseDownOutsidePanel.current = !panelRef.current || !panelRef.current.contains(e.target);
    },
    onMouseUp: (e) => {
      const upOutside = !panelRef.current || !panelRef.current.contains(e.target);
      if (mouseDownOutsidePanel.current && upOutside) navigate(-1);
      mouseDownOutsidePanel.current = false;
    },
  };

  // 加载态与内容态共用同一个面板节点（同样的外层结构），入场只播一次，内容在已落定的面板里替换
  // 大面板淡入上浮，不走信号：整页横向抖动会把表单内容拽偏，看起来像错位
  const panelMotion = {
    variants: m.variant('overlayEnter'),
    initial: 'hidden',
    animate: 'visible',
    transition: m.transition('overlay'),
  };
  const dialogProps = isOverlay
    ? { role: 'dialog', 'aria-modal': 'true', 'aria-label': '设置', tabIndex: -1, onKeyDown: onTab }
    : {};

  if (loading) {
    return isOverlay ? (
      <div className="we-settings-overlay" {...overlayHandlers}>
        <div className="we-settings-panel-wrap">
          <motion.div ref={panelRef} className="we-settings-panel we-settings-panel-overlay" {...panelMotion} {...dialogProps}>
            <div className="we-settings-loading" role="status" aria-label="设置加载中">
              <div className="we-settings-loading-scrim" aria-hidden="true" />
            </div>
          </motion.div>
        </div>
      </div>
    ) : (
      <div className="we-edit-canvas we-settings-canvas-loading">
        <div className="we-settings-loading" role="status" aria-label="设置加载中">
          <div className="we-settings-loading-scrim" aria-hidden="true" />
        </div>
      </div>
    );
  }

  const settingsContent = (
    <div className="we-settings-panel-wrap">
      <motion.div
        ref={isOverlay ? panelRef : undefined}
        className={`we-settings-panel${isOverlay ? ' we-settings-panel-overlay' : ''}`}
        {...panelMotion}
        {...dialogProps}
      >
        <nav className="we-settings-nav">
          <button className="we-edit-back" onClick={handleBack}>← 返回</button>
          <div className="we-settings-nav-header">
            <p className="we-settings-nav-title">设置</p>
          </div>
          <div ref={navItemsRef} className="we-settings-nav-items">
            <BounceRail containerRef={navItemsRef} activeKey={activeSection} />
            {NAV_SECTIONS.map((s) => (
              <ListItem
                key={s.key}
                data-bounce-item
                selected={activeSection === s.key}
                aria-current={activeSection === s.key ? 'page' : undefined}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </ListItem>
            ))}
          </div>
          <div className="we-settings-nav-footer">
            <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
          </div>
        </nav>

        <div className="we-settings-body">
          <div className="we-settings-body-main">
            {activeSection === NAV_KEY.LLM && (
              <div className="we-settings-section">
                <LlmConfigPanel {...llmProps} settingsMode={settingsMode} />
              </div>
            )}
            {activeSection === NAV_KEY.PROMPT && (
              <div className="we-settings-section">
                <PromptConfigPanel {...promptProps} settingsMode={settingsMode} />
              </div>
            )}
            {activeSection === NAV_KEY.FEATURES && (
              <div className="we-settings-section">
                <FeaturesConfigPanel
                  settingsMode={settingsMode}
                  shortTermTokenBudget={promptProps.shortTermTokenBudget}
                  setShortTermTokenBudget={promptProps.setShortTermTokenBudget}
                  onSaveShortTermTokenBudget={promptProps.onSaveShortTermTokenBudget}
                  writingShortTermTokenBudget={promptProps.writingShortTermTokenBudget}
                  setWritingShortTermTokenBudget={promptProps.setWritingShortTermTokenBudget}
                  onSaveWritingShortTermTokenBudget={promptProps.onSaveWritingShortTermTokenBudget}
                  chapterTurnSize={promptProps.chapterTurnSize}
                  setChapterTurnSize={promptProps.setChapterTurnSize}
                  onSaveChapterTurnSize={promptProps.onSaveChapterTurnSize}
                  writingChapterTurnSize={promptProps.writingChapterTurnSize}
                  setWritingChapterTurnSize={promptProps.setWritingChapterTurnSize}
                  onSaveWritingChapterTurnSize={promptProps.onSaveWritingChapterTurnSize}
                  pageTurnSize={promptProps.pageTurnSize}
                  setPageTurnSize={promptProps.setPageTurnSize}
                  onSavePageTurnSize={promptProps.onSavePageTurnSize}
                  writingPageTurnSize={promptProps.writingPageTurnSize}
                  setWritingPageTurnSize={promptProps.setWritingPageTurnSize}
                  onSaveWritingPageTurnSize={promptProps.onSaveWritingPageTurnSize}
                  memoryExpansionEnabled={promptProps.memoryExpansionEnabled}
                  onToggleMemoryExpansion={promptProps.onToggleMemoryExpansion}
                  writingMemoryExpansionEnabled={promptProps.writingMemoryExpansionEnabled}
                  onToggleWritingMemoryExpansion={promptProps.onToggleWritingMemoryExpansion}
                  longTermIndexBudget={promptProps.longTermIndexBudget}
                  setLongTermIndexBudget={promptProps.setLongTermIndexBudget}
                  onSaveLongTermIndexBudget={promptProps.onSaveLongTermIndexBudget}
                  stateInjectionTokenBudget={promptProps.stateInjectionTokenBudget}
                  setStateInjectionTokenBudget={promptProps.setStateInjectionTokenBudget}
                  onSaveStateInjectionTokenBudget={promptProps.onSaveStateInjectionTokenBudget}
                  chatDiaryEnabled={diaryProps.chatEnabled}
                  onToggleChatDiaryEnabled={diaryProps.onToggleChatEnabled}
                  chatDateMode={diaryProps.chatDateMode}
                  onChangeChatDateMode={diaryProps.onChangeChatDateMode}
                  writingDiaryEnabled={diaryProps.writingEnabled}
                  onToggleWritingDiaryEnabled={diaryProps.onToggleWritingEnabled}
                  writingDateMode={diaryProps.writingDateMode}
                  onChangeWritingDateMode={diaryProps.onChangeWritingDateMode}
                  showThinking={llmProps.showThinking}
                  onToggleShowThinking={llmProps.onToggleShowThinking}
                  autoCollapseThinking={llmProps.autoCollapseThinking}
                  onToggleAutoCollapseThinking={llmProps.onToggleAutoCollapseThinking}
                  showTokenUsage={llmProps.showTokenUsage}
                  onToggleShowTokenUsage={llmProps.onToggleShowTokenUsage}
                  suggestionEnabled={promptProps.suggestionEnabled}
                  onToggleSuggestion={promptProps.onToggleSuggestion}
                  writingSuggestionEnabled={promptProps.writingSuggestionEnabled}
                  onToggleWritingSuggestion={promptProps.onToggleWritingSuggestion}
                  danmakuEnabled={promptProps.danmakuEnabled}
                  onToggleDanmaku={promptProps.onToggleDanmaku}
                  danmakuCount={promptProps.danmakuCount}
                  setDanmakuCount={promptProps.setDanmakuCount}
                  onSaveDanmakuCount={promptProps.onSaveDanmakuCount}
                  danmakuSpeed={promptProps.danmakuSpeed}
                  onChangeDanmakuSpeed={promptProps.onChangeDanmakuSpeed}
                />
              </div>
            )}
            {activeSection === NAV_KEY.CSS && (
              <div className="we-settings-section">
                <SectionTitle level="section" rule="under" as="h2">自定义 CSS</SectionTitle>
                <CustomCssManager settingsMode={settingsMode} />
              </div>
            )}
            {activeSection === NAV_KEY.THEME && (
              <div className="we-settings-section">
                <SectionTitle level="section" rule="under" as="h2">视觉</SectionTitle>
                <ThemeManager />
                <SectionTitle level="section" rule="under" as="h2" className="we-settings-section-title--sub">动效</SectionTitle>
                <MotionPackPicker />
              </div>
            )}
            {activeSection === NAV_KEY.REGEX && (
              <div className="we-settings-section">
                <SectionTitle level="section" rule="under" as="h2">正则规则</SectionTitle>
                <RegexRulesManager settingsMode={settingsMode} />
              </div>
            )}
            {activeSection === NAV_KEY.IMPORT_EXPORT && (
              <div className="we-settings-section">
                <ImportExportPanel settingsMode={settingsMode} onImportSuccess={onImportSuccess} />
              </div>
            )}
            {activeSection === NAV_KEY.PROVIDER_SAFETY && (
              <div className="we-settings-section">
                <ProviderSafetyPanel />
              </div>
            )}
            {activeSection === NAV_KEY.ABOUT && (
              <div className="we-settings-section">
                <AboutPanel />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );

  return isOverlay ? (
    <div className="we-settings-overlay" {...overlayHandlers}>
      {settingsContent}
    </div>
  ) : (
    <div className="we-edit-canvas">
      {settingsContent}
    </div>
  );
}
