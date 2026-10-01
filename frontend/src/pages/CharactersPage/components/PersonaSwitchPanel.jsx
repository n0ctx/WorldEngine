import { AnimatePresence, motion } from 'framer-motion';
import { SortableList } from '../../../components';
import Button from '../../../components/ui/Button.jsx';
import Card from '../../../components/ui/Card.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';
import { PersonaCard } from './PersonaCard.jsx';

// ── 「我扮演」区块：收起的当前玩家行 / 展开的玩家卡切换列表 ─────────────────────

export function PersonaSwitchPanel({
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
}) {
  return (
    <AnimatePresence initial={false}>
      {!personaExpanded ? (
        <motion.div key="persona-row" {...personaSwitchMotion}>
          <Card variant="outlined" density="compact" className="we-persona-switch-row">
            {activePersona ? (
              <>
                <CharacterSeal character={activePersona} size={32} />
                <span className="we-persona-switch-name">
                  {activePersona.name || '（未命名玩家）'}
                </span>
              </>
            ) : (
              <span className="we-persona-switch-name we-persona-switch-name--empty">
                {loading ? '' : '暂无玩家卡'}
              </span>
            )}
            {activePersona && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => navigate(
                  `/worlds/${worldId}/personas/${activePersona.id}/edit`,
                  { state: { backgroundLocation: location } }
                )}
              >
                编辑
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => setPersonaExpanded(true)}
            >
              切换
            </Button>
          </Card>
        </motion.div>
      ) : (
        <motion.div key="persona-panel" {...personaSwitchMotion}>
          <div className="we-persona-switch-panel">
            <div className="we-characters-col-actions we-persona-switch-actions we-on-shell">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => personaImportRef.current?.click()}
                disabled={importingPersona}
                title="导入玩家卡"
              >
                {importingPersona ? '…' : '导入'}
              </Button>
              <input
                ref={personaImportRef}
                type="file"
                accept=".json,.wepersona.json,.wechar.json"
                className="hidden"
                onChange={onImportPersonaFile}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(
                  `/worlds/${worldId}/personas/new`,
                  { state: { backgroundLocation: location } }
                )}
                title="创建玩家"
              >
                + 创建
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setPersonaExpanded(false)}
                title="收起"
              >
                收起
              </Button>
            </div>

            <div className="we-characters-col-list we-persona-switch-list">
              {personas.length === 0 ? (
                loading ? null : (
                  <EmptyState size="sm" title="暂无玩家卡" />
                )
              ) : (
                <SortableList
                  items={personas}
                  onReorder={setPersonas}
                  onReorderEnd={onReorderEnd}
                  useHandle={true}
                  renderItem={(p, dragHandleProps) => (
                    <PersonaCard
                      persona={{ ...p, _isLast: personas.length === 1 }}
                      dragHandleProps={dragHandleProps}
                      onCardClick={() => {
                        // 切换 persona 时清掉旧 writing session hint，避免误命中其他 persona 的 session
                        setCurrentWritingSessionId(null);
                        navigate(`/worlds/${worldId}/writing`);
                      }}
                      onActivate={() => onActivatePersona(p.id)}
                      onEdit={() => navigate(
                        `/worlds/${worldId}/personas/${p.id}/edit`,
                        { state: { backgroundLocation: location } }
                      )}
                      onDelete={() => setDeletingPersona(p)}
                    />
                  )}
                />
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
