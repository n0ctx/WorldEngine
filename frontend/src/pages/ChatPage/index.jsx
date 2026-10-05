import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import useStore from '../../core/state/index.js';
import useCurrentStoryStore from '../../core/state/currentStory.js';
import { loadRules } from '../../core/utils/regex-runner.js';
import { usePageConfig } from '../../core/hooks/usePageConfig.js';
import { useConversationPageState } from '../../core/hooks/useConversationPageState.js';
import { useChatStream } from './hooks/useChatStream.js';
import { useChatPageCharacter, useChatPageSession } from './hooks/useChatPageSession.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import { useWorld } from '../../core/hooks/useWorld.js';
import { chatStorylineTitle } from '../../core/hooks/storyline.js';
import ChatPageShell from './components/ChatPageShell.jsx';
import ChatConversationPane from './components/ChatConversationPane.jsx';

export default function ChatPage() {
  const motionPrefs = useMotion();
  const { characterId } = useParams();

  const { chapterTurnSize, pageTurnSize } = usePageConfig();
  const { currentSessionId, setCurrentSessionId, setCurrentCharacterId } = useStore();
  const { character, persona } = useChatPageCharacter(characterId);
  // 切换期间 character 可能还是上一个角色，建会话只认与路由一致的角色
  const routeCharacter = character?.id === characterId ? character : null;
  const world = useWorld(character?.world_id ?? null);
  const {
    pageInfo, setPageInfo, inputBoxRef, messageListRef, memory,
  } = useConversationPageState();
  const { memoryRecalling, memoryWriting, recallSummary } = memory;

  const stream = useChatStream({
    character: routeCharacter,
    messageListRef,
    inputBoxRef,
    currentSessionId,
    setCurrentSessionId,
    memory,
  });

  const { handleCreateChatSession } = useChatPageSession({
    characterId,
    currentSessionId,
    character: routeCharacter,
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
    setStoryTitle(stream.currentSession?.title || (character ? chatStorylineTitle(character.name) : null));
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
          world={world}
          persona={persona}
          currentSession={stream.currentSession}
          currentSessionId={currentSessionId}
          config={{ chapterTurnSize, pageTurnSize }}
          pageState={{ pageInfo, setPageInfo, inputBoxRef, messageListRef }}
          stream={stream}
          motionPrefs={motionPrefs}
        />
      )}
    />
  );
}
