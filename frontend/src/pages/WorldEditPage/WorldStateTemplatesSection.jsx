import StateFieldList from '../../components/rules/StateFieldList';
import WorldProfileDefaultsFields from '../../components/rules/WorldProfileDefaultsFields.jsx';
import Divider from '../../components/ui/Divider.jsx';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
} from '../../core/api/world-state-fields';
import {
  listCharacterStateFields, createCharacterStateField,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../../core/api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../../core/api/persona-state-fields';

export default function WorldStateTemplatesSection({ worldId, navigate, diaryChatDateMode }) {
  return (
    <div>
      <p className="we-edit-hint">这一页的修改即时生效，不用点保存。</p>
      <p className="we-config-workshop-hint">
        想以字段为中心、一站式设置各角色/玩家默认值与设定条目？
        <button
          type="button"
          className="we-workshop-entry-link"
          onClick={() => navigate(`/worlds/${worldId}/rules?tab=state`)}
        >
          前往这个世界的规则 →
        </button>
      </p>
      <WorldProfileDefaultsFields worldId={worldId} />
      <StateFieldList
        scope="world"
        worldId={worldId}
        diaryDateMode={diaryChatDateMode}
        listFn={listWorldStateFields}
        createFn={createWorldStateField}
        updateFn={updateWorldStateField}
        deleteFn={deleteWorldStateField}
        reorderFn={reorderWorldStateFields}
      />
      <Divider size="lg" />
      <StateFieldList
        scope="character"
        worldId={worldId}
        listFn={listCharacterStateFields}
        createFn={createCharacterStateField}
        updateFn={updateCharacterStateField}
        deleteFn={deleteCharacterStateField}
        reorderFn={reorderCharacterStateFields}
      />
      <Divider size="lg" />
      <StateFieldList
        scope="persona"
        worldId={worldId}
        listFn={listPersonaStateFields}
        createFn={createPersonaStateField}
        updateFn={updatePersonaStateField}
        deleteFn={deletePersonaStateField}
        reorderFn={reorderPersonaStateFields}
      />
    </div>
  );
}
