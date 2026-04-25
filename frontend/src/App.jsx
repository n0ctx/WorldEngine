import { lazy, Suspense, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import TopBar from './components/book/TopBar.jsx';
import PageTransition from './components/book/PageTransition.jsx';
import { refreshCustomCss } from './api/custom-css-snippets';
import { getConfig } from './api/config';
import { useDisplaySettingsStore } from './store/displaySettings';
import { useAssistantStore } from '../../assistant/client/useAssistantStore.js';

const WorldsPage = lazy(() => import('./pages/WorldsPage'));

const WorldEditPage = lazy(() => import('./pages/WorldEditPage'));
const CharactersPage = lazy(() => import('./pages/CharactersPage'));

const CharacterEditPage = lazy(() => import('./pages/CharacterEditPage'));
const PersonaEditPage = lazy(() => import('./pages/PersonaEditPage'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const WritingSpacePage = lazy(() => import('./pages/WritingSpacePage'));
const WorldConfigPage = lazy(() => import('./pages/WorldConfigPage'));
const AssistantPanel = lazy(() => import('../../assistant/client/AssistantPanel.jsx'));

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

export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;
  const setShowThinking = useDisplaySettingsStore((s) => s.setShowThinking);
  const setAutoCollapseThinking = useDisplaySettingsStore((s) => s.setAutoCollapseThinking);
  const setShowTokenUsage = useDisplaySettingsStore((s) => s.setShowTokenUsage);
  const isAssistantOpen = useAssistantStore((s) => s.isOpen);
  const [assistantLoaded, setAssistantLoaded] = useState(false);

  useEffect(() => {
    refreshCustomCss('chat');
    getConfig().then((c) => {
      setShowThinking(c.ui?.show_thinking !== false);
      setAutoCollapseThinking(c.ui?.auto_collapse_thinking !== false);
      setShowTokenUsage(c.ui?.show_token_usage === true);
    }).catch(() => {});
  }, [setAutoCollapseThinking, setShowThinking, setShowTokenUsage]);

  useEffect(() => {
    if (isAssistantOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- latch lazy AssistantPanel after first open.
      setAssistantLoaded(true);
    }
  }, [isAssistantOpen]);

  return (
    <div className="we-app-root">
      <TopBar />
      <PageTransition>
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
      </PageTransition>

      {assistantLoaded && (
        <Suspense fallback={null}>
          <AssistantPanel />
        </Suspense>
      )}

      {/* 抽屉路由：仅当从背景页导航来时渲染，背景页保持可见 */}
      {backgroundLocation && (
        <Suspense fallback={null}>
          <Routes>
            <Route path="/worlds/new" element={<WorldEditPage />} />
            <Route path="/worlds/:worldId/edit" element={<WorldEditPage />} />
            <Route path="/worlds/:worldId/persona" element={<PersonaEditPage />} />
            <Route path="/worlds/:worldId/personas/new" element={<PersonaEditPage />} />
            <Route path="/worlds/:worldId/personas/:personaId/edit" element={<PersonaEditPage />} />
            <Route path="/worlds/:worldId/characters/new" element={<CharacterEditPage />} />
            <Route path="/characters/:characterId/edit" element={<CharacterEditPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Suspense>
      )}
    </div>
  );
}
