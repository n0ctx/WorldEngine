import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteTheme,
  downloadTheme,
  DEFAULT_THEME_ID,
  importTheme,
  listThemes,
  refreshThemeCss,
  setActiveTheme,
} from '../../api/themes.js';
import { refreshCustomCss } from '../../api/custom-css-snippets.js';
import { readJsonFile } from '../../api/import-export.js';
import { useAppModeStore } from '../../store/appMode.js';
import Button from '../ui/Button.jsx';
import { log } from '../../utils/logger.js';

export default function ThemeManager() {
  const [themes, setThemes] = useState([]);
  const [activeTheme, setActiveThemeState] = useState(DEFAULT_THEME_ID);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const fileInputRef = useRef(null);
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

  async function handleImport(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusyId('__import__');
    try {
      const imported = await importTheme(await readJsonFile(file));
      await load();
      await switchTheme(imported.id);
    } catch (err) {
      log.error('themes.import_failed', err, { toast: `导入失败：${err.message}` });
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id) {
    setBusyId(id);
    try {
      await deleteTheme(id);
      await load();
      if (activeTheme === id) {
        await refreshThemeCss(DEFAULT_THEME_ID);
        await refreshCustomCss(appMode);
        setActiveThemeState(DEFAULT_THEME_ID);
      }
    } catch (err) {
      log.error('themes.delete_failed', err, { toast: `删除失败：${err.message}` });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="we-theme-manager">
      <div className="we-theme-toolbar">
        <div>
          <p className="we-theme-current-label">当前主题</p>
          <p className="we-theme-current-value">{themes.find((t) => t.id === activeTheme)?.name || activeTheme}</p>
        </div>
        <div className="we-theme-toolbar-actions">
          <input
            ref={fileInputRef}
            className="we-visually-hidden"
            type="file"
            accept=".json,.wetheme.json,application/json"
            onChange={handleImport}
          />
          <Button
            variant="ghost"
            size="sm"
            disabled={busyId === '__import__'}
            onClick={() => fileInputRef.current?.click()}
          >
            导入主题
          </Button>
        </div>
      </div>

      {loading ? (
        <p className="we-theme-empty">加载中…</p>
      ) : themes.length === 0 ? (
        <p className="we-theme-empty">暂无主题</p>
      ) : (
        <div className="we-theme-list">
          {themes.map((theme) => {
            const active = theme.id === activeTheme;
            const busy = busyId === theme.id;
            return (
              <article key={theme.id} className={`we-theme-card${active ? ' active' : ''}`}>
                <div className="we-theme-card-main">
                  <ThemeSwatch theme={theme} />
                  <div className="we-theme-meta">
                    <div className="we-theme-title-row">
                      <h3 className="we-theme-name">{theme.name}</h3>
                      <span className="we-theme-badge">{theme.builtin ? '内置' : '用户'}</span>
                      {active && <span className="we-theme-badge we-theme-badge-active">使用中</span>}
                    </div>
                    <p className="we-theme-desc">{theme.description || `${theme.id} · ${theme.version}`}</p>
                  </div>
                </div>
                <div className="we-theme-actions">
                  <Button variant="ghost" size="sm" onClick={() => downloadTheme(theme.id)} disabled={busy}>
                    导出
                  </Button>
                  {!active && (
                    <Button variant="ghost" size="sm" onClick={() => switchTheme(theme.id)} disabled={busy}>
                      切换
                    </Button>
                  )}
                  {!theme.builtin && (
                    <Button variant="danger" size="sm" onClick={() => handleDelete(theme.id)} disabled={busy}>
                      删除
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
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
        '--theme-paper': preview.paper || 'var(--we-paper-base)',
        '--theme-accent': preview.accent || 'var(--we-vermilion)',
        '--theme-ink': preview.ink || 'var(--we-ink-primary)',
      }}
    >
      <span />
      <span />
      <span />
    </div>
  );
}
