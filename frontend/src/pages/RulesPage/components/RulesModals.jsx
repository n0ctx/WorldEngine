import StateFieldEditor from '../../../components/state/StateFieldEditor';
import NewSystemWizard from './NewSystemWizard.jsx';

export default function RulesModals({
  creatingField, fieldScopeKey, fieldScope, worldId, loadFieldsFor, setSelectedFieldKey, setCreatingField,
  wizardOpen, setWizardOpen, setNavMode,
}) {
  return (
    <>
      {/* 新建字段定义 */}
      {creatingField && (
        <StateFieldEditor
          field={null}
          scope={fieldScopeKey}
          onSave={async (payload) => {
            const created = await fieldScope.createFn(worldId, payload);
            await loadFieldsFor(fieldScopeKey);
            setSelectedFieldKey(created?.field_key ?? payload.field_key);
          }}
          onClose={() => setCreatingField(false)}
        />
      )}

      {/* 新建系统向导 */}
      {wizardOpen && (
        <NewSystemWizard
          worldId={worldId}
          scope={fieldScope}
          scopeKey={fieldScopeKey}
          onClose={() => setWizardOpen(false)}
          onFinish={async (createdKey) => {
            setWizardOpen(false);
            await loadFieldsFor(fieldScopeKey);
            setNavMode('fields');
            if (createdKey) setSelectedFieldKey(createdKey);
          }}
        />
      )}
    </>
  );
}
