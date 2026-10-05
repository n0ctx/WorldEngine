import { useState } from 'react';
import EntryEditorPanel from './EntryEditorPanel.jsx';
import { log } from '../../core/utils/logger.js';
import saveEntryEditor from './saveEntryEditor.js';
import useEntryEditorData from './useEntryEditorData.js';
import useEntryTriggerSuggestion from './useEntryTriggerSuggestion.js';
import {
  applyConditionPatch, clampActiveTurns, findScopeForFieldLabel, parseKeywordScope, validateEntryForm,
} from './entryEditorRules.js';

export default function EntryEditor({
  worldId, entry, defaultTriggerType,
  prefillCondition, onClose, onSave, inline = false, dialog,
}) {
  const isNew = !entry?.id;
  const [form, setForm] = useState(() => ({
    title: entry?.title ?? '',
    content: entry?.content ?? '',
    description: entry?.description ?? '',
    keywords: entry?.keywords ?? [],
    // 未指定机制时默认「AI 判断相关」——新建条目不强求用户先决定触发方式
    trigger_type: entry?.trigger_type ?? defaultTriggerType ?? 'llm',
    condition_logic: entry?.condition_logic ?? 'AND',
    keyword_logic: entry?.keyword_logic === 'AND' ? 'AND' : 'OR',
    keyword_scope: entry ? parseKeywordScope(entry.keyword_scope) : ['user', 'assistant'],
    active_turns: clampActiveTurns(entry?.active_turns ?? 1),
    token: entry?.token ?? 1,
  }));
  const [savedForm, setSavedForm] = useState(form);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedKey, setSavedKey] = useState(0);
  const editorData = useEntryEditorData({
    worldId, entry, isNew, prefillCondition, triggerType: form.trigger_type,
  });
  const {
    conditions, setConditions, savedConditions, setSavedConditions, rawFieldsByScope, fieldTypeMap, conditionsInitRef,
  } = editorData;
  const dirty = !sameJson(form, savedForm)
    || (form.trigger_type === 'state' && savedConditions !== null && !sameJson(conditions, savedConditions));
  const { suggestion, setSuggestion, setDismissedFor } = useEntryTriggerSuggestion(
    form.content, form.trigger_type, editorData.properNouns, editorData.allStateFieldLabels,
  );

  function addKeyword(value) {
    setForm((f) => ({ ...f, keywords: [...f.keywords, value] }));
  }
  function removeKeyword(v) {
    setForm((f) => ({ ...f, keywords: f.keywords.filter((k) => k !== v) }));
  }

  function updateCondition(index, patch) {
    setConditions((prev) => prev.map((c, i) => {
      if (i !== index) return c;
      return applyConditionPatch(c, patch, fieldTypeMap);
    }));
  }

  // 采用智能建议：只切换机制 + 预填对应参数，不动用户已经填的其它内容；用户不采用则完全不受影响。
  function handleAdoptSuggestion() {
    if (!suggestion) return;
    setForm((f) => ({ ...f, trigger_type: suggestion.trigger_type }));
    if (suggestion.trigger_type === 'keyword' && suggestion.prefill?.keywords) {
      setForm((f) => ({ ...f, keywords: [...new Set([...f.keywords, ...suggestion.prefill.keywords])] }));
    }
    if (suggestion.trigger_type === 'state' && suggestion.prefill?.conditions?.length) {
      const c = suggestion.prefill.conditions[0];
      const scope = findScopeForFieldLabel(c.field_label, rawFieldsByScope);
      // 标记条件已初始化，防止「切到 state 时补拉已有条件/预填」的 effect 随后把这次采用的结果冲掉
      conditionsInitRef.current = true;
      setConditions([{
        scope, field_label: c.field_label, col_key: '',
        target_field: `${scope}.${c.field_label}`, operator: c.operator, value: c.value,
      }]);
    }
    setSuggestion(null);
  }

  function handleDismissSuggestion() {
    setDismissedFor(form.content);
    setSuggestion(null);
  }

  // 内嵌时失败原因留在保存栏里，弹窗里弹提示
  async function handleSave() {
    const invalid = validateEntryForm(form);
    if (invalid) {
      if (inline) setSaveError(invalid);
      else log.error('entry.form.invalid', null, { toast: invalid });
      return;
    }
    const sent = { form, conditions };
    setSaving(true);
    setSaveError('');
    try {
      await saveEntryEditor({ worldId, entry, isNew, form, conditions, onSave });
      setSavedForm(sent.form);
      setSavedConditions(sent.conditions);
      setSavedKey((key) => key + 1);
    } catch (err) {
      if (inline) setSaveError(err.message || '未知错误');
      log.error('entry.save_failed', err, inline ? { silent: true } : { toast: `保存失败：${err.message}` });
    } finally {
      setSaving(false);
    }
  }

  const model = {
    isNew, form, setForm, saving, onClose,
    save: { creating: isNew, dirty, saving, error: saveError, savedKey, saveLabel: isNew ? '创建' : '保存', onSave: handleSave },
    addKeyword, removeKeyword,
    suggestion, handleAdoptSuggestion, handleDismissSuggestion,
    conditions, fieldTypeMap, rawFieldsByScope, updateCondition, setConditions, handleSave,
  };
  return <EntryEditorPanel model={model} inline={inline} dialog={dialog} />;
}

function sameJson(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}
