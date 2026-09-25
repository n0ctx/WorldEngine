import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import {
  StateFieldIdentityFields,
  StateFieldMetadataFields,
  StateFieldTypeFields,
} from './StateFieldEditorFields.jsx';
import {
  createLockedColumnKeys,
  createStateFieldForm,
  saveStateField,
} from './stateFieldEditor.logic.js';

const DIARY_TIME_FIELD_KEY = 'diary_time';

/**
 * StateFieldEditor — 创建/编辑状态字段的模态弹窗
 * Props:
 *   field         — 现有字段对象（编辑模式）或 null（创建模式）
 *   scope         — 'world' | 'character'（保留参数，不影响当前逻辑）
 *   diaryDateMode — 'virtual' | 'real' | undefined（仅 diary_time 字段时传入）
 *   onSave(data)  — 父组件负责调用 API，返回 Promise
 *   onClose()
 */
export default function StateFieldEditor({ field, scope, diaryDateMode, onSave, onClose, inline = false }) {
  useEscapeKey(onClose, !inline);
  const [lockedColumnKeys] = useState(() => createLockedColumnKeys(field));
  const [form, setForm] = useState(() => createStateFieldForm(field));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    await saveStateField(form, scope, onSave, onClose, setError, setSaving);
  }

  const isDiaryTime = field?.field_key === DIARY_TIME_FIELD_KEY;
  const isRealDiary = isDiaryTime && diaryDateMode === 'real';
  const panel = (
    <div className={inline ? 'we-state-field-inline flex flex-col gap-4' : 'we-dialog-panel w-full max-w-2xl flex flex-col max-h-[90vh]'}>
      {!inline && (
        <div className="we-dialog-header">
          <h2>{field ? '编辑字段' : '新建字段'}</h2>
        </div>
      )}

      <div className="we-dialog-body flex flex-col gap-4">
        <StateFieldIdentityFields field={field} form={form} setForm={setForm} />
        <StateFieldTypeFields
          form={form}
          setForm={setForm}
          lockedColumnKeys={lockedColumnKeys}
          isDiaryTime={isDiaryTime}
          isRealDiary={isRealDiary}
        />
        <StateFieldMetadataFields form={form} setForm={setForm} scope={scope} />
        {error && <p className="we-state-field-error">{error}</p>}
      </div>

      <div className="we-dialog-footer">
        <button onClick={onClose} className="we-btn we-btn-sm we-btn-secondary">取消</button>
        <button onClick={handleSave} disabled={saving} className="we-btn we-btn-sm we-btn-primary">
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  );

  if (inline) return panel;
  return createPortal(
    <div className="fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center bg-black/60 px-4">
      {panel}
    </div>,
    document.body,
  );
}
