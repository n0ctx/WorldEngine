import { useState, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import useStore from '../../core/state/index';
import { useMotion } from '../../core/hooks/useMotion.js';
import { storylineTitle } from '../../core/hooks/storyline.js';
import { useWorldHubData } from './hooks/useWorldHubData.js';
import { useCardImport } from './hooks/useCardImport.js';
import { useOnboardingGuide } from './hooks/useOnboardingGuide.js';
import { useCharacterActions } from './hooks/useCharacterActions.js';
import { usePersonaActions } from './hooks/usePersonaActions.js';
import { useStorylineActions } from './hooks/useStorylineActions.js';
import { NewWorldGuide } from './components/NewWorldGuide.jsx';
import { DeleteConfirmModals } from './components/DeleteConfirmModals.jsx';
import { StorylineColumn } from './components/StorylineColumn.jsx';
import { CastColumn } from './components/CastColumn.jsx';
import { SideColumn } from './components/SideColumn.jsx';

// ── CharactersPage（世界层枢纽）──────────────────────────────────────────────

export default function CharactersPage() {
  const { worldId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const setCurrentWritingSessionId = useStore((s) => s.setCurrentWritingSessionId);

  const {
    world, setWorld,
    characters, setCharacters,
    personas, setPersonas,
    entries,
    stateFields,
    timeline, setTimeline,
    loading,
    loadError,
    loadData,
  } = useWorldHubData(worldId);

  const {
    importingChar,
    importingPersona,
    charImportRef,
    personaImportRef,
    handleImportCharFile,
    handleImportPersonaFile,
  } = useCardImport(worldId, setCharacters, setPersonas);

  const [personaExpanded, setPersonaExpanded] = useState(false);
  const m = useMotion();
  // 收放过程中裁掉溢出，落定后放开，避免卡片阴影和拖拽被裁
  const personaSwitchMotion = {
    initial: { height: 0, opacity: 0, overflow: 'hidden' },
    animate: { height: 'auto', opacity: 1, transitionEnd: { overflow: 'visible' } },
    exit: { height: 0, opacity: 0, overflow: 'hidden' },
    transition: m.transition('medium'),
  };

  const charactersById = useMemo(() => {
    const map = {};
    for (const c of characters) map[c.id] = c;
    return map;
  }, [characters]);

  const activePersona = useMemo(() => personas.find((p) => p.is_active) || null, [personas]);

  const { guideCompleted, showGuide, handleGuideStepClick, handleDismissGuide } = useOnboardingGuide({
    worldId, world, setWorld, characters, entries, navigate, location,
  });

  const {
    handleStorylineClick, handleCreateStoryline, handleCharacterChat, deletingStoryline, setDeletingStoryline, handleDeleteStoryline,
  } = useStorylineActions(worldId, navigate, setCurrentWritingSessionId, setTimeline);

  const { deletingChar, setDeletingChar, handleDeleteChar, handleCharReorderEnd } = useCharacterActions(worldId, setCharacters);

  const {
    deletingPersona, setDeletingPersona, handleDeletePersona, handleActivatePersona, handlePersonaReorderEnd,
  } = usePersonaActions({ worldId, setPersonas, setTimeline, setPersonaExpanded, setCurrentWritingSessionId });

  if (loadError) {
    return (
      <div className="we-characters-loading we-characters-error">
        <p className="we-characters-error-text">{loadError}</p>
        <button className="we-characters-create-btn" onClick={loadData}>重试</button>
      </div>
    );
  }

  return (
    <div className="we-characters-canvas">
      {/* 返回导航已收口到顶栏面包屑（TopBar），此页不再自带返回按钮 */}

      {/* 新世界搭建引导：三步未完成且未被手动关闭时，取代下方整套空态 */}
      {showGuide && (
        <NewWorldGuide
          completed={guideCompleted}
          onStepClick={handleGuideStepClick}
          onDismiss={handleDismissGuide}
        />
      )}

      {/* 世界层三栏：故事线 / 角色 / 我扮演 + 世界规则 */}
      {!showGuide && (
      <div className="we-worldhub-layout">

        <StorylineColumn
          loading={loading}
          timeline={timeline}
          charactersById={charactersById}
          onCreateStoryline={handleCreateStoryline}
          onStorylineClick={handleStorylineClick}
          onStorylineDelete={setDeletingStoryline}
        />

        <CastColumn
          worldId={worldId}
          navigate={navigate}
          location={location}
          loading={loading}
          characters={characters}
          setCharacters={setCharacters}
          onReorderEnd={handleCharReorderEnd}
          importingChar={importingChar}
          charImportRef={charImportRef}
          onImportCharFile={handleImportCharFile}
          onCharacterClick={handleCharacterChat}
          setDeletingChar={setDeletingChar}
        />

        <SideColumn
          worldId={worldId}
          navigate={navigate}
          location={location}
          loading={loading}
          personaExpanded={personaExpanded}
          setPersonaExpanded={setPersonaExpanded}
          personaSwitchMotion={personaSwitchMotion}
          activePersona={activePersona}
          personas={personas}
          setPersonas={setPersonas}
          onReorderEnd={handlePersonaReorderEnd}
          importingPersona={importingPersona}
          personaImportRef={personaImportRef}
          onImportPersonaFile={handleImportPersonaFile}
          setCurrentWritingSessionId={setCurrentWritingSessionId}
          onActivatePersona={handleActivatePersona}
          setDeletingPersona={setDeletingPersona}
          entryCount={entries.length}
          fieldCount={stateFields.length}
        />
      </div>
      )}

      <DeleteConfirmModals
        deletingChar={deletingChar}
        onCloseDeletingChar={() => setDeletingChar(null)}
        onConfirmDeleteChar={handleDeleteChar}
        deletingPersona={deletingPersona}
        onCloseDeletingPersona={() => setDeletingPersona(null)}
        onConfirmDeletePersona={handleDeletePersona}
        deletingStoryline={deletingStoryline}
        deletingStorylineTitle={deletingStoryline && storylineTitle(deletingStoryline, charactersById)}
        onCloseDeletingStoryline={() => setDeletingStoryline(null)}
        onConfirmDeleteStoryline={handleDeleteStoryline}
      />
    </div>
  );
}
