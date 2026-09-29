import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_THEME_ID,
  listThemes,
  refreshThemeCss,
  setActiveTheme,
} from '../../core/api/themes.js';
import { refreshCustomCss } from '../../core/api/custom-css-snippets.js';
import { useAppModeStore } from '../../core/state/appMode.js';
import Button from '../ui/Button.jsx';
import { log } from '../../core/utils/logger.js';

export default function ThemeManager() {
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveThemeState] = useState(DEFAULT_THEME_ID);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const appMode = useAppModeStore((s) => s.appMode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listThemes();
      setThemes(data.themes || []);
      setActiveThemeState(data.activeTheme || DEFAULT_THEME_ID);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void load();
    }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  async function switchTheme(id) {
    setBusyId(id);
    const previousTheme = activeTheme;
    try {
      await setActiveTheme(id);
      await refreshThemeCss(id);
      await refreshCustomCss(appMode);
      setActiveThemeState(id);
    } catch (err) {
      if (previousTheme && previousTheme !== id) {
        await setActiveTheme(previousTheme).catch((rollbackErr) => {
          log.warn('themes.rollback_failed', rollbackErr);
        });
      }
      log.error('themes.switch_failed', err, { toast: `切换失败：${err.message}` });
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <p className="we-theme-empty">加载中…</p>;

  return (
    <div className="we-theme-list">
      {themes.map((theme) => {
        const active = theme.id === activeTheme;
        return (
          <article key={theme.id} className={`we-theme-card${active ? ' active' : ''}`}>
            <div className="we-theme-card-main">
              <ThemeSwatch theme={theme} />
              <div className="we-theme-meta">
                <div className="we-theme-title-row">
                  <h3 className="we-theme-name">{theme.name}</h3>
                  {active && <span className="we-theme-badge we-theme-badge-active">使用中</span>}
                </div>
                <p className="we-theme-desc">{theme.description || `${theme.id} · ${theme.version}`}</p>
              </div>
            </div>
            {!active && (
              <div className="we-theme-actions">
                <Button variant="ghost" size="sm" onClick={() => switchTheme(theme.id)} disabled={busyId === theme.id}>
                  切换
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}

function ThemeSwatch({ theme }) {
  const preview = theme.preview || {};
  return (
    <div
      className="we-theme-swatch"
      aria-hidden="true"
      style={{
        '--theme-paper': preview.paper || 'var(--we-color-bg-canvas)',
        '--theme-accent': preview.accent || 'var(--we-color-accent)',
        '--theme-ink': preview.ink || 'var(--we-color-text-primary)',
      }}
    >
      <span />
      <span />
      <span />
    </div>
  );
}
