import { useEffect, useState } from 'react';
import useStore from '../../store/index.js';
import { getWorldStateValues, resetWorldStateValues } from '../../api/worldStateValues.js';
import { getCharacterStateValues, resetCharacterStateValues } from '../../api/characterStateValues.js';
import { getWorldTimeline } from '../../api/worldTimeline.js';
import { getPersonaStateValues, resetPersonaStateValues } from '../../api/personaStateValues.js';
import { getWorld } from '../../api/worlds.js';
import CharacterSeal from './CharacterSeal.jsx';
import StatusSection from './StatusSection.jsx';
import MarginaliaList from './MarginaliaList.jsx';

export default function StatePanel({ character, worldId, characterId, persona, recalledItems = [] }) {
  const tick = useStore((s) => s.memoryRefreshTick);

  const [charState, setCharState] = useState(null);
  const [charResetting, setCharResetting] = useState(false);

  const [personaState, setPersonaState] = useState(null);
  const [personaResetting, setPersonaResetting] = useState(false);

  const [worldState, setWorldState] = useState(null);
  const [worldResetting, setWorldResetting] = useState(false);

  const [timeline, setTimeline] = useState(null);
  const [worldName, setWorldName] = useState(null);

  // 初始数据拉取
  useEffect(() => {
    if (!characterId) return;
    getCharacterStateValues(characterId).then(setCharState).catch(console.error);
  }, [characterId]);

  useEffect(() => {
    if (!worldId) return;
    getPersonaStateValues(worldId).then(setPersonaState).catch(console.error);
    getWorldStateValues(worldId).then(setWorldState).catch(console.error);
    getWorldTimeline(worldId, 5).then(setTimeline).catch(console.error);
    getWorld(worldId).then((w) => setWorldName(w?.name ?? null)).catch(() => {});
  }, [worldId]);

  // 轮询：AI 回复结束后感知异步状态更新
  useEffect(() => {
    if (tick === 0) return;

    const snapshot = JSON.stringify([charState, personaState, worldState, timeline]);
    let intervalId;
    let timeoutId;

    intervalId = setInterval(async () => {
      try {
        const [newChar, newPersona, newWorld, newTimeline] = await Promise.all([
          characterId ? getCharacterStateValues(characterId) : Promise.resolve(null),
          worldId ? getPersonaStateValues(worldId) : Promise.resolve(null),
          worldId ? getWorldStateValues(worldId) : Promise.resolve(null),
          worldId ? getWorldTimeline(worldId, 5) : Promise.resolve(null),
        ]);
        const current = JSON.stringify([newChar, newPersona, newWorld, newTimeline]);
        if (current !== snapshot) {
          if (newChar !== null) setCharState(newChar);
          if (newPersona !== null) setPersonaState(newPersona);
          if (newWorld !== null) setWorldState(newWorld);
          if (newTimeline !== null) setTimeline(newTimeline);
          clearInterval(intervalId);
          clearTimeout(timeoutId);
        }
      } catch {
        clearInterval(intervalId);
        clearTimeout(timeoutId);
      }
    }, 3000);

    timeoutId = setTimeout(() => {
      clearInterval(intervalId);
    }, 20000);

    return () => {
      clearInterval(intervalId);
      clearTimeout(timeoutId);
    };
  }, [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleResetChar() {
    if (!characterId || charResetting) return;
    setCharResetting(true);
    try {
      const rows = await resetCharacterStateValues(characterId);
      setCharState(rows);
    } catch (e) {
      console.error('重置角色状态失败', e);
    } finally {
      setCharResetting(false);
    }
  }

  async function handleResetPersona() {
    if (!worldId || personaResetting) return;
    setPersonaResetting(true);
    try {
      const rows = await resetPersonaStateValues(worldId);
      setPersonaState(rows);
    } catch (e) {
      console.error('重置玩家状态失败', e);
    } finally {
      setPersonaResetting(false);
    }
  }

  async function handleResetWorld() {
    if (!worldId || worldResetting) return;
    setWorldResetting(true);
    try {
      const rows = await resetWorldStateValues(worldId);
      setWorldState(rows);
    } catch (e) {
      console.error('重置世界状态失败', e);
    } finally {
      setWorldResetting(false);
    }
  }

  return (
    <div
      className="we-state-panel"
      style={{
        width: 280,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--we-paper-aged)',
        borderLeft: '1px solid var(--we-paper-shadow)',
        overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--we-paper-shadow) transparent',
        position: 'relative',
      }}
    >
      {/* 左侧书脊阴影 12px */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 12,
          background: 'linear-gradient(to right, rgba(0,0,0,0.14) 0%, rgba(0,0,0,0.04) 40%, transparent 100%)',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />

      {/* 头部：印章 + 角色名 + 世界名 */}
      <div
        className="we-state-panel-header"
        style={{ paddingTop: 20, paddingBottom: 14, paddingLeft: 16, paddingRight: 16 }}
      >
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <CharacterSeal character={character} size={72} />
        </div>
        {character ? (
          <>
            <p style={{
              fontFamily: "'ZCOOL XiaoWei','Cormorant Garamond',serif",
              fontSize: 16,
              color: 'var(--we-ink-primary)',
              textAlign: 'center',
              marginTop: 10,
              marginBottom: 0,
            }}>
              {character.name}
            </p>
            {worldName && (
              <p style={{
                fontSize: 10,
                fontStyle: 'italic',
                color: 'var(--we-ink-faded)',
                textAlign: 'center',
                marginTop: 3,
                marginBottom: 0,
              }}>
                {worldName}
              </p>
            )}
          </>
        ) : (
          <p style={{
            fontSize: 12,
            fontStyle: 'italic',
            color: 'var(--we-ink-faded)',
            textAlign: 'center',
            marginTop: 10,
            marginBottom: 0,
          }}>
            尚未选择角色
          </p>
        )}
      </div>

      {/* 1px 金叶分隔线 */}
      <div style={{ borderTop: '1px solid var(--we-gold-leaf)', marginLeft: 20, marginRight: 20 }} />

      {/* 内容区：各状态区块 */}
      <div style={{ paddingLeft: 14, paddingRight: 14, paddingBottom: 20 }}>
        {/* 角色状态 */}
        <StatusSection
          title="CURRENT STATE"
          className="we-status-character"
          rows={charState}
          pinnedName={character?.name}
          onReset={handleResetChar}
          resetting={charResetting}
        />

        {/* 玩家状态 */}
        <StatusSection
          title="PLAYER"
          className="we-status-player"
          rows={personaState}
          pinnedName={persona?.name}
          onReset={handleResetPersona}
          resetting={personaResetting}
        />

        {/* 世界状态 */}
        <StatusSection
          title="WORLD"
          className="we-status-world"
          rows={worldState}
          onReset={handleResetWorld}
          resetting={worldResetting}
        />

        {/* 世界时间线 */}
        <div className="we-timeline">
          <div className="we-state-section-title">
            <span>TIMELINE</span>
          </div>
          {!timeline || timeline.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--we-ink-faded)', fontStyle: 'italic', margin: 0 }}>暂无记录</p>
          ) : (
            timeline.slice(0, 5).map((entry) => (
              <div key={entry.id} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                <span style={{ color: 'var(--we-ink-faded)', flexShrink: 0 }}>·</span>
                <span style={{
                  fontSize: 13,
                  color: 'var(--we-ink-secondary)',
                  lineHeight: 1.55,
                  opacity: entry.is_compressed === 1 ? 0.45 : 1,
                  fontStyle: entry.is_compressed === 1 ? 'italic' : 'normal',
                }}>
                  {entry.is_compressed === 1 ? `旧史·${entry.content}` : entry.content}
                </span>
              </div>
            ))
          )}
        </div>

        {/* 召回批注（T66 接入 SSE 后填充真实数据） */}
        <div className="we-state-section">
          <div className="we-state-section-title">
            <span>RECALLED</span>
          </div>
          <MarginaliaList items={recalledItems} />
        </div>
      </div>
    </div>
  );
}
