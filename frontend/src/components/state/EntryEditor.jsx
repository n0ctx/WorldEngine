import { useRef, useState } from 'react';
import EntryEditorPanel from './EntryEditorPanel.jsx';
import { log } from '../../core/utils/logger.js';
import { useEscapeKey } from '../../core/hooks/useEscapeKey.js';
import saveEntryEditor from './saveEntryEditor.js';
import useEntryEditorData from './useEntryEditorData.js';
import useEntryTriggerSuggestion from './useEntryTriggerSuggestion.js';
import { applyConditionPatch, clampActiveTurns, findScopeForFieldLabel, parseKeywordScope } from './entryEditorRules.js';

export default function EntryEditor({
  worldId, entry, defaultTriggerType, defaultGroupName, existingGroupNames,
  prefillCondition, onClose, onSave, inline = false,
}) {
  useEscapeKey(onClose, !inline);
  const isNew = !entry?.id;
  const [form, setForm] = useState({
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
    group_name: entry?.group_name ?? defaultGroupName ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [keywordInput, setKeywordInput] = useState('');
  const keywordRef = useRef(null);
  const editorData = useEntryEditorData({
    worldId, entry, isNew, prefillCondition, triggerType: form.trigger_type,
  });
  const {
    conditions, setConditions, rawFieldsByScope, fieldTypeMap, conditionsInitRef,
  } = editorData;
  const { suggestion, setSuggestion, setDismissedFor } = useEntryTriggerSuggestion(
    form.content, form.trigger_type, editorData.properNouns, editorData.allStateFieldLabels,
  );

  function addKeyword(raw) {
    const v = String(raw ?? '').trim();
    if (!v) return;
    setForm((f) => (f.keywords.includes(v) ? f : { ...f, keywords: [...f.keywords, v] }));
    setKeywordInput('');
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

  async function handleSave() {
    if (!form.title.trim()) return;
    if (form.trigger_type === 'keyword' && form.keyword_scope.length === 0) {
      log.error('entry.role.invalid', null, { toast: '必须勾选 user 或 assistant 至少一项' });
      return;
    }
    setSaving(true);
    try {
      await saveEntryEditor({ worldId, entry, isNew, form, keywordInput, conditions, onSave });
    } catch (err) {
      log.error('entry.save_failed', err, { toast: `保存失败：${err.message}` });
    } finally {
      setSaving(false);
    }
  }

  const model = {
    isNew, form, setForm, saving, existingGroupNames, onClose,
    keywordInput, setKeywordInput, keywordRef, addKeyword, removeKeyword,
    suggestion, handleAdoptSuggestion, handleDismissSuggestion,
    conditions, fieldTypeMap, rawFieldsByScope, updateCondition, setConditions, handleSave,
  };
  return <EntryEditorPanel model={model} inline={inline} />;
}
