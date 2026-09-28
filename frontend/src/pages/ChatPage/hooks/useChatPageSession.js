import { useEffect, useState } from 'react';
import useStore from '../../../core/state/index.js';
import { getCharacter } from '../../../core/api/characters.js';
import { getPersona } from '../../../core/api/personas.js';
import { getSession, createSession } from '../../../core/api/sessions.js';
import { chatSessionListBridge } from '../../../core/utils/session-list-bridge.js';
import { log } from '../../../core/utils/logger.js';

export function useChatPageCharacter(characterId) {
  const [loadedContext, setLoadedContext] = useState(null);
  const character = loadedContext?.characterId === characterId ? loadedContext.character : null;
  const persona = loadedContext?.characterId === characterId ? loadedContext.persona : null;

  useEffect(() => {
    if (!characterId) return;
    let cancelled = false;

    getCharacter(characterId).then((loadedCharacter) => {
      if (cancelled) return;
      setLoadedContext({ characterId, character: loadedCharacter, persona: null });
      if (loadedCharacter.world_id) {
        getPersona(loadedCharacter.world_id).then((loadedPersona) => {
          if (!cancelled) {
            setLoadedContext((current) => current?.characterId === characterId
              ? { ...current, persona: loadedPersona }
              : current);
          }
        }).catch((err) => {
          log.error('chat.persona.load_failed', err, { toast: '加载玩家信息失败' });
        });
      }
    }).catch((err) => {
      log.error('chat.character.load_failed', err, { toast: '加载角色信息失败' });
    });

    return () => {
      cancelled = true;
    };
  }, [characterId]);

  return { character, persona };
}

export function useChatPageSession({
  characterId,
  currentSessionId,
  character,
  setCurrentCharacterId,
  setCurrentSession,
  clearActiveSession,
  handleSessionCreate,
}) {
  useEffect(() => {
    if (!characterId) return;
    const previousCharacterId = useStore.getState().currentCharacterId;
    if (previousCharacterId && previousCharacterId !== characterId) clearActiveSession();
    setCurrentCharacterId(characterId);
  }, [characterId, clearActiveSession, setCurrentCharacterId]);

  useEffect(() => {
    if (!characterId) return;
    if (!currentSessionId) {
      setCurrentSession(null);
      return;
    }
    if (useStore.getState().currentSessionId !== currentSessionId) return;

    let cancelled = false;
    getSession(currentSessionId)
      .then((session) => {
        if (cancelled) return;
        if (session?.character_id === characterId) {
          setCurrentSession(session);
          return;
        }
        clearActiveSession();
      })
      .catch(() => {
        if (!cancelled) clearActiveSession();
      });

    return () => {
      cancelled = true;
    };
  }, [characterId, currentSessionId, clearActiveSession, setCurrentSession]);

  async function handleCreateChatSession() {
    if (!character) return;
    try {
      const session = await createSession(character.id);
      chatSessionListBridge.addSession?.(session);
      handleSessionCreate(session);
    } catch (e) {
      log.error('session.create_failed', e, { toast: e.message || '创建会话失败' });
    }
  }

  return { handleCreateChatSession };
}
