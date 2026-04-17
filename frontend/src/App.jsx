import { useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import WorldsPage from './pages/WorldsPage';
import WorldCreatePage from './pages/WorldCreatePage';
import WorldEditPage from './pages/WorldEditPage';
import CharactersPage from './pages/CharactersPage';
import CharacterCreatePage from './pages/CharacterCreatePage';
import CharacterEditPage from './pages/CharacterEditPage';
import PersonaEditPage from './pages/PersonaEditPage';
import ChatPage from './pages/ChatPage';
import SettingsPage from './pages/SettingsPage';
import WritingSpacePage from './pages/WritingSpacePage';
import TopBar from './components/book/TopBar.jsx';
import PageTransition from './components/book/PageTransition.jsx';
import { refreshCustomCss } from './api/customCssSnippets';

export default function App() {
  const location = useLocation();
  const backgroundLocation = location.state?.backgroundLocation;

  useEffect(() => {
    refreshCustomCss();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden', background: 'var(--we-book-bg)' }}>
      <TopBar />
      <PageTransition>
        <Routes location={backgroundLocation || location}>
          <Route path="/" element={<WorldsPage />} />
          <Route path="/worlds/new" element={<WorldCreatePage />} />
          <Route path="/worlds/:worldId" element={<CharactersPage />} />
          <Route path="/worlds/:worldId/edit" element={<WorldEditPage />} />
          <Route path="/worlds/:worldId/persona" element={<PersonaEditPage />} />
          <Route path="/worlds/:worldId/characters/new" element={<CharacterCreatePage />} />
          <Route path="/characters/:characterId/edit" element={<CharacterEditPage />} />
          <Route path="/characters/:characterId/chat" element={<ChatPage />} />
          <Route path="/worlds/:worldId/writing" element={<WritingSpacePage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </PageTransition>

      {/* 抽屉路由：仅当从背景页导航来时渲染，背景页保持可见 */}
      {backgroundLocation && (
        <Routes>
          <Route path="/worlds/:worldId/persona" element={<PersonaEditPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      )}
    </div>
  );
}
