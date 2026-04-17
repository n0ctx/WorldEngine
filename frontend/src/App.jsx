import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
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
import { refreshCustomCss } from './api/customCssSnippets';

export default function App() {
  useEffect(() => {
    refreshCustomCss();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--we-book-bg)' }}>
      <TopBar />
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Routes>
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
      </div>
    </div>
  );
}
