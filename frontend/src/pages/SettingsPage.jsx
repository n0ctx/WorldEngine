import { useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettingsConfig } from '../hooks/useSettingsConfig';
import LlmConfigPanel from '../components/settings/LlmConfigPanel';
import PromptConfigPanel from '../components/settings/PromptConfigPanel';
import ImportExportPanel from '../components/settings/ImportExportPanel';
import AboutPanel from '../components/settings/AboutPanel';
import ModeSwitch from '../components/settings/ModeSwitch';
import CustomCssManager from '../components/settings/CustomCssManager';
import RegexRulesManager from '../components/settings/RegexRulesManager';
import FeaturesConfigPanel from '../components/settings/FeaturesConfigPanel';
import { NAV_SECTIONS, NAV_KEY, SETTINGS_MODE } from '../components/settings/SettingsConstants';

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const [activeSection, setActiveSection] = useState(NAV_SECTIONS[0].key);
  const [settingsMode, setSettingsMode] = useState(SETTINGS_MODE.CHAT);
  const { loading, llmProps, promptProps, diaryProps, onImportSuccess } = useSettingsConfig();
  const panelRef = useRef(null);
  const mouseDownOutsidePanel = useRef(false);

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

  if (loading) {
    return isOverlay ? (
      <div className="we-settings-overlay" {...overlayHandlers}>
        <div ref={panelRef} className="we-settings-panel we-settings-panel-overlay">
          <div className="we-settings-loading">
            <p className="we-settings-loading-text">加载中…</p>
          </div>
        </div>
      </div>
    ) : (
      <div className="we-edit-canvas we-settings-canvas-loading">
        <p className="we-settings-loading-text">加载中…</p>
      </div>
    );
  }

  const settingsContent = (
    <div className="we-settings-panel-wrap">
      <div
        ref={isOverlay ? panelRef : undefined}
        className={`we-settings-panel${isOverlay ? ' we-settings-panel-overlay' : ''}`}
      >
        <nav className="we-settings-nav">
          <button className="we-edit-back" onClick={handleBack}>← 返回</button>
          <p className="we-settings-nav-title">设置</p>
          <div className="we-settings-nav-items">
            {NAV_SECTIONS.map((s) => (
              <button
                key={s.key}
                className={`we-settings-nav-item${activeSection === s.key ? ' active' : ''}`}
                onClick={() => setActiveSection(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        </nav>

        <div className="we-settings-body">
          {activeSection === NAV_KEY.LLM && (
            <div className="we-settings-section">
              <LlmConfigPanel {...llmProps} settingsMode={settingsMode} onModeChange={setSettingsMode} />
            </div>
          )}
          {activeSection === NAV_KEY.PROMPT && (
            <div className="we-settings-section">
              <PromptConfigPanel {...promptProps} settingsMode={settingsMode} onModeChange={setSettingsMode} />
            </div>
          )}
          {activeSection === NAV_KEY.FEATURES && (
            <div className="we-settings-section">
              <FeaturesConfigPanel
                settingsMode={settingsMode}
                onModeChange={setSettingsMode}
                contextRounds={promptProps.contextRounds}
                setContextRounds={promptProps.setContextRounds}
                onSaveContextRounds={promptProps.onSaveContextRounds}
                writingContextRounds={promptProps.writingContextRounds}
                setWritingContextRounds={promptProps.setWritingContextRounds}
                onSaveWritingContextRounds={promptProps.onSaveWritingContextRounds}
                memoryExpansionEnabled={promptProps.memoryExpansionEnabled}
                onToggleMemoryExpansion={promptProps.onToggleMemoryExpansion}
                writingMemoryExpansionEnabled={promptProps.writingMemoryExpansionEnabled}
                onToggleWritingMemoryExpansion={promptProps.onToggleWritingMemoryExpansion}
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
              />
            </div>
          )}
          {activeSection === NAV_KEY.CSS && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">自定义 CSS</h2>
              <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
              <CustomCssManager settingsMode={settingsMode} />
            </div>
          )}
          {activeSection === NAV_KEY.REGEX && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">正则规则</h2>
              <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
              <RegexRulesManager settingsMode={settingsMode} />
            </div>
          )}
          {activeSection === NAV_KEY.IMPORT_EXPORT && (
            <div className="we-settings-section">
              <ImportExportPanel onImportSuccess={onImportSuccess} />
            </div>
          )}
          {activeSection === NAV_KEY.ABOUT && (
            <div className="we-settings-section">
              <AboutPanel />
            </div>
          )}
        </div>
      </div>
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
