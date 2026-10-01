import { useState } from 'react';
import Button from '../ui/Button';
import Dialog from '../ui/Dialog';
import { useStateMemorySchema } from '../../core/hooks/useStateMemory.js';
import {
  StateFieldIdentityFields,
  StateFieldMetadataFields,
  StateFieldTypeFields,
} from './StateFieldEditorFields.jsx';
import {
  createLockedColumnKeys,
  createStateFieldForm,
  isReservedWorldFieldLabel,
  saveStateField,
} from './stateFieldEditor.logic.js';

/**
 * StateFieldEditor — 创建/编辑状态字段的模态弹窗
 * Props:
 *   field         — 现有字段对象（编辑模式）或 null（创建模式）
 *   scope         — 'world' | 'character'
 *   onSave(data)  — 父组件负责调用 API，返回 Promise
 *   onClose()
 */
export default function StateFieldEditor({ field, scope, onSave, onClose, inline = false }) {
  const [lockedColumnKeys] = useState(() => createLockedColumnKeys(field));
  const [form, setForm] = useState(() => createStateFieldForm(field));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { schema } = useStateMemorySchema();
  const reservedWorldFieldLabels = schema?.reservedWorldFieldLabels;
  const isReserved = isReservedWorldFieldLabel(scope, form.label, reservedWorldFieldLabels);

  async function handleSave() {
    await saveStateField(form, scope, reservedWorldFieldLabels, onSave, onClose, setError, setSaving);
  }

  const fields = (
    <>
      <StateFieldIdentityFields
        field={field}
        form={form}
        setForm={setForm}
        scope={scope}
        reservedWorldFieldLabels={reservedWorldFieldLabels}
      />
      <StateFieldTypeFields
        form={form}
        setForm={setForm}
        lockedColumnKeys={lockedColumnKeys}
      />
      <StateFieldMetadataFields form={form} setForm={setForm} scope={scope} />
      {error && <p className="we-state-field-error">{error}</p>}
    </>
  );
  const actions = (
    <>
      <Button variant="ghost" onClick={onClose}>取消</Button>
      <Button variant="primary" onClick={handleSave} disabled={saving || isReserved}>
        {saving ? '保存中…' : '保存'}
      </Button>
    </>
  );

  if (inline) {
    return (
      <div className="we-state-field-inline flex flex-col gap-4">
        <div className="we-state-field-inline__body flex flex-col gap-4">{fields}</div>
        <div className="we-state-field-inline__footer">{actions}</div>
      </div>
    );
  }
  return (
    <Dialog
      size="lg"
      title={field ? '编辑字段' : '新建字段'}
      busy={saving}
      onClose={onClose}
      bodyClassName="flex flex-col gap-4"
      footer={actions}
    >
      {fields}
    </Dialog>
  );
}
