import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import useStore from '../../core/state/index.js';
import useCurrentStoryStore from '../../core/state/currentStory.js';
import { loadRules } from '../../core/utils/regex-runner.js';
import { usePageConfig } from '../../core/hooks/usePageConfig.js';
import { useConversationPageState } from '../../core/hooks/useConversationPageState.js';
import { useChatStream } from './hooks/useChatStream.js';
import { useChatPageCharacter, useChatPageSession } from './hooks/useChatPageSession.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import ChatPageShell from './components/ChatPageShell.jsx';
import ChatConversationPane from './components/ChatConversationPane.jsx';

export default function ChatPage() {
  const motionPrefs = useMotion();
  const { characterId } = useParams();
  const navigate = useNavigate();

  const { chapterTurnSize, pageTurnSize } = usePageConfig();
  const { currentSessionId, setCurrentSessionId, setCurrentCharacterId } = useStore();
  const { character, persona } = useChatPageCharacter(characterId);
  const {
    pageInfo, setPageInfo, inputBoxRef, messageListRef, memory,
  } = useConversationPageState();
  const { memoryRecalling, memoryWriting, recallSummary } = memory;

  const stream = useChatStream({
    character,
    messageListRef,
    inputBoxRef,
    currentSessionId,
    setCurrentSessionId,
    memory,
  });

  const { handleCreateChatSession } = useChatPageSession({
    characterId,
    currentSessionId,
    character,
    setCurrentCharacterId,
    setCurrentSession: stream.setCurrentSession,
    clearActiveSession: stream.clearActiveSession,
    handleSessionCreate: stream.handleSessionCreate,
  });

  useEffect(() => {
    loadRules('chat').catch(() => {});
  }, []);

  const setStoryTitle = useCurrentStoryStore((s) => s.setStoryTitle);
  useEffect(() => {
    setStoryTitle(stream.currentSession?.title || (character ? `与${character.name}的对话` : null));
  }, [stream.currentSession?.title, character, setStoryTitle]);
  useEffect(() => () => setStoryTitle(null), [setStoryTitle]);

  return (
    <ChatPageShell
      character={character}
      persona={persona}
      currentSessionId={currentSessionId}
      clearActiveSession={stream.clearActiveSession}
      setCurrentSession={stream.setCurrentSession}
      onCreateSession={handleCreateChatSession}
      memoryRecall={{ memoryRecalling, memoryWriting, recallSummary }}
      onDiaryInject={stream.setPendingDiaryInject}
      main={(
        <ChatConversationPane
          character={character}
          persona={persona}
          currentSession={stream.currentSession}
          currentSessionId={currentSessionId}
          config={{ chapterTurnSize, pageTurnSize }}
          pageState={{ pageInfo, setPageInfo, inputBoxRef, messageListRef }}
          stream={stream}
          motionPrefs={motionPrefs}
          onBack={() => navigate(`/worlds/${character?.world_id}`)}
        />
      )}
    />
  );
}
