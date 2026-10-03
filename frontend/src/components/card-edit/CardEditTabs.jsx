import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import Button from '../ui/Button';
import FormGroup from '../ui/FormGroup';
import SectionTabs from '../ui/SectionTabs.jsx';
import StateValueField from '../state/StateValueField';
import StateExtractPreviewModal from './StateExtractPreviewModal';
import { applyExtractedValues } from './applyExtractedValues.js';
import { groupRowsByProfile } from '../state/profile-groups.js';
import { log } from '../../core/utils/logger.js';

function ValueRows({ fields, onSave }) {
  return (
    <div className="we-state-value-list">
      {fields.map((field) => (
        <div key={field.field_key} className="we-state-value-row">
          <p className="we-state-value-label">{field.label}</p>
          <StateValueField field={field} onSave={onSave} />
        </div>
      ))}
    </div>
  );
}

/** 失败只提示不抛出：StateValueField 自动保存，没有地方接住错误 */
function withSaveToast(write, failMessage) {
  return async (fieldKey, valueJson) => {
    try {
      await write(fieldKey, valueJson);
    } catch (err) {
      log.error('card.state_init.save_failed', err, { toast: err.message || failMessage });
    }
  };
}

function StateInitialValuesPanel({ profileRows, stateFields, writeProfile, writeState, onExtract }) {
  const groups = groupRowsByProfile(profileRows);
  const saveProfile = withSaveToast(writeProfile, '档案初始值保存失败');
  const saveState = withSaveToast(writeState, '状态值保存失败');

  return (
    <div className="we-edit-form-stack">
      <p className="we-edit-hint">修改自动保存。这里填的值会在新故事线里直接带入，留空的部分由 AI 按人设补全。</p>
      <div className="we-state-extract-trigger-row">
        <Button variant="secondary" size="sm" onClick={onExtract}>AI 提取状态字段建议</Button>
      </div>
      {groups.map(({ group, fields }) => (
        <FormGroup key={group} label={group}>
          <ValueRows fields={fields} onSave={saveProfile} />
        </FormGroup>
      ))}
      {stateFields.length > 0 && (
        <FormGroup label="现状">
          <ValueRows fields={stateFields} onSave={saveState} />
        </FormGroup>
      )}
    </div>
  );
}

/**
 * 角色卡 / 玩家卡编辑页的页签：设定页（调用方传入）+「状态初始值」页。
 * 状态初始值页有档案（身份 / 外貌 / 人格，按 profileRows 里出现的分组）和现状（用户状态字段），
 * 这里填的值在会话里建立对应实体时直接带入；AI 提取的建议按 profile_key 分别写进档案或状态字段。
 * stateInit 为 null（新建时还没有 id）时只有设定页。
 */
export default function CardEditTabs({ basicTab, stateInit }) {
  const [showExtract, setShowExtract] = useState(false);

  async function handleExtractConfirm(items) {
    try {
      await applyExtractedValues(items, (item) => (item.profile_key
        ? stateInit.writeProfile(item.profile_key, item.suggested_value_json)
        : stateInit.writeState(item.field_key, item.suggested_value_json)));
    } finally {
      stateInit.onChanged(); // 部分失败时已成功写入的部分仍需刷新显示
    }
  }

  const sections = stateInit
    ? [basicTab, {
      key: 'state_init',
      label: '状态初始值',
      content: <StateInitialValuesPanel {...stateInit} onExtract={() => setShowExtract(true)} />,
    }]
    : [basicTab];

  return (
    <>
      <SectionTabs sections={sections} defaultKey="basic" variant="gooey" />
      <AnimatePresence>
        {showExtract && (
          <StateExtractPreviewModal
            onExtract={stateInit.extract}
            onConfirm={handleExtractConfirm}
            onClose={() => setShowExtract(false)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
