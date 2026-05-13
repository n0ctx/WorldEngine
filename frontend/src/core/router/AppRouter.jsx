/**
 * Core app composition: routes and overlays, no shell-specific UI.
 *
 * `AppRouter` is rendered as the `children` of the active shell (see App.jsx
 * and `selectShell.js`). It contains nothing about top bars, transitions,
 * or visual frames — those belong to the shell.
 */
import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { refreshCustomCss } from '../api/custom-css-snippets';
import { getConfig } from '../api/config';
import { DEFAULT_THEME_ID, refreshThemeCss } from '../api/themes.js';
import { useDisplaySettingsStore } from '../state/displaySettings';
import { useAppModeStore } from '../state/appMode';
import { invalidateCache, loadRules } from '../utils/regex-runner.js';
import { useAssistantPanel } from '../features/assistant/index.js';
import { OVERLAY_ROUTES } from './route-constants.js';

const WorldsPage = lazy(() => import('../../pages/WorldsPage'));
const WorldEditPage = lazy(() => import('../../pages/WorldEditPage'));
const CharactersPage = lazy(() => import('../../pages/CharactersPage'));
const CharacterEditPage = lazy(() => import('../../pages/CharacterEditPage'));
const PersonaEditPage = lazy(() => import('../../pages/PersonaEditPage'));
const ChatPage = lazy(() => import('../../pages/ChatPage'));
const SettingsPage = lazy(() => import('../../pages/SettingsPage'));
const WritingSpacePage = lazy(() => import('../../pages/WritingSpacePage'));
const WorldConfigPage = lazy(() => import('../../pages/WorldConfigPage'));
const AssistantPanel = lazy(() => import('../features/assistant/AssistantPanelHost.jsx'));

function RedirectToConfig() {
  const { worldId } = useParams();
  return <Navigate to={`/worlds/${worldId}/config`} replace />;
}

function RouteFallback() {
  return (
    <div className="we-edit-canvas we-route-fallback">
      <p className="we-edit-empty-text">页面加载中…</p>
    </div>
  );
}

export default function AppRouter() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const setShowThinking = useDisplaySettingsStore((s) => s.setShowThinking);
  const setAutoCollapseThinking = useDisplaySettingsStore((s) => s.setAutoCollapseThinking);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);
  const isAssistantOpen = useAssistantPanel((s) => s.isOpen);
  const appMode = useAppModeStore((s) => s.appMode);
  const [assistantLoaded, setAssistantLoaded] = useState(false);
  const overlayElements = {
    '/worlds/new': <WorldEditPage />,
    '/worlds/:worldId/edit': <WorldEditPage />,
    '/worlds/:worldId/persona': <PersonaEditPage />,
    '/worlds/:worldId/personas/new': <PersonaEditPage />,
    '/worlds/:worldId/personas/:personaId/edit': <PersonaEditPage />,
    '/worlds/:worldId/characters/new': <CharacterEditPage />,
    '/characters/:characterId/edit': <CharacterEditPage />,
    '/settings': <SettingsPage />,
  };

  useEffect(() => {
    getConfig().then((c) => {
      setShowThinking(c.ui?.show_thinking !== false);
      setAutoCollapseThinking(c.ui?.auto_collapse_thinking !== false);
      setShowTokenUsage(c.ui?.show_token_usage === true);
      return refreshThemeCss(c.ui?.theme || DEFAULT_THEME_ID, { silent: true });
    }).then(() => {
      return refreshCustomCss('chat');
    }).catch(() => {});
  }, [setAutoCollapseThinking, setShowThinking, setShowTokenUsage]);

  // 写卡助手在 apply_css_snippet / apply_regex_rule 成功后会派发对应事件；
  // 监听必须挂在根组件（而非设置页内组件）上，否则用户停留在聊天/世界/角色页时
  // 设置组件未挂载，事件没人接 → 注入的 <style id="we-custom-css"> 和正则缓存
  // 都不会更新，必须刷新页面才能看到效果。
  useEffect(() => {
    const onCssUpdated = () => { refreshCustomCss(appMode).catch(() => {}); };
    const onRegexUpdated = () => {
      invalidateCache();
      loadRules(appMode).catch(() => {});
    };
    window.addEventListener('we:css-updated', onCssUpdated);
    window.addEventListener('we:regex-updated', onRegexUpdated);
    return () => {
      window.removeEventListener('we:css-updated', onCssUpdated);
      window.removeEventListener('we:regex-updated', onRegexUpdated);
    };
  }, [appMode]);

  useEffect(() => {
    if (isAssistantOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- latch lazy AssistantPanel after first open.
      setAssistantLoaded(true);
    }
  }, [isAssistantOpen]);

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes location={backgroundLocation || location}>
          <Route path="/" element={<WorldsPage />} />
          <Route path="/worlds/new" element={<WorldEditPage />} />
          <Route path="/worlds/:worldId" element={<CharactersPage />} />
          <Route path="/worlds/:worldId/edit" element={<WorldEditPage />} />
          <Route path="/worlds/:worldId/persona" element={<PersonaEditPage />} />
          <Route path="/worlds/:worldId/personas/new" element={<PersonaEditPage />} />
          <Route path="/worlds/:worldId/personas/:personaId/edit" element={<PersonaEditPage />} />
          <Route path="/worlds/:worldId/characters/new" element={<CharacterEditPage />} />
          <Route path="/characters/:characterId/edit" element={<CharacterEditPage />} />
          <Route path="/characters/:characterId/chat" element={<ChatPage />} />
          <Route path="/worlds/:worldId/writing" element={<WritingSpacePage />} />
          <Route path="/worlds/:worldId/config" element={<WorldConfigPage />} />
          <Route path="/worlds/:worldId/build" element={<RedirectToConfig />} />
          <Route path="/worlds/:worldId/state" element={<RedirectToConfig />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </Suspense>

      {assistantLoaded && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}

      {/* 抽屉路由：仅当从背景页导航来时渲染，背景页保持可见 */}
      {backgroundLocation && (
        <Suspense fallback={null}>
          <Routes>
            {OVERLAY_ROUTES.map((path) => (
              <Route key={path} path={path} element={overlayElements[path]} />
            ))}
          </Routes>
        </Suspense>
      )}
    </>
  );
}
