import { Routes, Route } from 'react-router-dom';
import WorldsPage from './pages/WorldsPage';
import CharactersPage from './pages/CharactersPage';
import CharacterEditPage from './pages/CharacterEditPage';
import ChatPage from './pages/ChatPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<WorldsPage />} />
      <Route path="/worlds/:worldId" element={<CharactersPage />} />
      <Route path="/characters/:characterId/edit" element={<CharacterEditPage />} />
      <Route path="/characters/:characterId/chat" element={<ChatPage />} />
    </Routes>
  );
}
