import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSettingsConfig } from '../hooks/useSettingsConfig';
import LlmConfigPanel from '../components/settings/LlmConfigPanel';
import PromptConfigPanel from '../components/settings/PromptConfigPanel';
import ImportExportPanel from '../components/settings/ImportExportPanel';
import AboutPanel from '../components/settings/AboutPanel';
import ModeSwitch from '../components/settings/ModeSwitch';
import CustomCssManager from '../components/settings/CustomCssManager';
import RegexRulesManager from '../components/settings/RegexRulesManager';
import { NAV_SECTIONS } from '../components/settings/_settings-constants';

export default function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isOverlay = !!location.state?.backgroundLocation;
  const [activeSection, setActiveSection] = useState('llm');
  const [settingsMode, setSettingsMode] = useState('chat');
  const { loading, llmProps, promptProps, onImportSuccess } = useSettingsConfig();

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

  if (loading) {
    return isOverlay ? (
      <div className="we-settings-overlay" onClick={() => navigate(-1)}>
        <div className="we-settings-panel we-settings-panel-overlay" onClick={(e) => e.stopPropagation()}>
          <div className="we-settings-loading">
            <p style={{ fontFamily: 'var(--we-font-serif)', color: 'var(--we-ink-faded)', fontStyle: 'italic' }}>加载中…</p>
          </div>
        </div>
      </div>
    ) : (
      <div className="we-edit-canvas" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <p style={{ fontFamily: 'var(--we-font-serif)', color: 'var(--we-ink-faded)', fontStyle: 'italic' }}>加载中…</p>
      </div>
    );
  }

  const settingsContent = (
    <div className="we-settings-panel-wrap">
      <div
        className={`we-settings-panel${isOverlay ? ' we-settings-panel-overlay' : ''}`}
        onClick={isOverlay ? (e) => e.stopPropagation() : undefined}
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
          {activeSection === 'llm' && (
            <div className="we-settings-section">
              <LlmConfigPanel {...llmProps} settingsMode={settingsMode} onModeChange={setSettingsMode} />
            </div>
          )}
          {activeSection === 'prompt' && (
            <div className="we-settings-section">
              <PromptConfigPanel {...promptProps} settingsMode={settingsMode} onModeChange={setSettingsMode} />
            </div>
          )}
          {activeSection === 'css' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">自定义 CSS</h2>
              <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
              <CustomCssManager settingsMode={settingsMode} />
            </div>
          )}
          {activeSection === 'regex' && (
            <div className="we-settings-section">
              <h2 className="we-settings-section-title">正则规则</h2>
              <ModeSwitch mode={settingsMode} onChange={setSettingsMode} />
              <RegexRulesManager settingsMode={settingsMode} />
            </div>
          )}
          {activeSection === 'import_export' && (
            <div className="we-settings-section">
              <ImportExportPanel onImportSuccess={onImportSuccess} />
            </div>
          )}
          {activeSection === 'about' && (
            <div className="we-settings-section">
              <AboutPanel />
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return isOverlay ? (
    <div className="we-settings-overlay" onClick={() => navigate(-1)}>
      {settingsContent}
    </div>
  ) : (
    <div className="we-edit-canvas">
      {settingsContent}
    </div>
  );
}
