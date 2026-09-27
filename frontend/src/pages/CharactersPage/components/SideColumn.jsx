import { PersonaSwitchPanel } from './PersonaSwitchPanel.jsx';
import { RulesEntryCard } from './RulesEntryCard.jsx';

// ── 右栏：我扮演 / 世界规则 ──────────────────────────────────────────────────

export function SideColumn({
  worldId,
  navigate,
  location,
  loading,
  personaExpanded,
  setPersonaExpanded,
  personaSwitchMotion,
  activePersona,
  personas,
  setPersonas,
  onReorderEnd,
  importingPersona,
  personaImportRef,
  onImportPersonaFile,
  setCurrentWritingSessionId,
  onActivatePersona,
  setDeletingPersona,
  entryCount,
  fieldCount,
}) {
  return (
    <div className="we-worldhub-side">
      <div className="we-worldhub-section">
        <div className="we-worldhub-section-header">
          <span className="we-worldhub-section-title">我扮演</span>
        </div>

        {/* 收起行与展开列表同时收放高度，读作同一块区域平滑长高 / 缩回 */}
        <PersonaSwitchPanel
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
          onReorderEnd={onReorderEnd}
          importingPersona={importingPersona}
          personaImportRef={personaImportRef}
          onImportPersonaFile={onImportPersonaFile}
          setCurrentWritingSessionId={setCurrentWritingSessionId}
          onActivatePersona={onActivatePersona}
          setDeletingPersona={setDeletingPersona}
        />
      </div>

      {/* 世界规则 */}
      <div className="we-worldhub-section">
        <div className="we-worldhub-section-header">
          <span className="we-worldhub-section-title">世界规则</span>
        </div>
        <RulesEntryCard
          entryCount={entryCount}
          fieldCount={fieldCount}
          onOpen={() => navigate(`/worlds/${worldId}/rules`)}
        />
      </div>

    </div>
  );
}
