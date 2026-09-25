import {
  createWorldEntry, updateWorldEntry, replaceEntryConditions,
} from '../../core/api/prompt-entries';
import { clampActiveTurns, clampToken } from './entryEditorRules.js';

export default async function saveEntryEditor({ worldId, entry, isNew, form, keywordInput, conditions, onSave }) {
  const draft = keywordInput.trim();
  const keywords = draft && !form.keywords.includes(draft)
    ? [...form.keywords, draft]
    : form.keywords;
  const data = {
    title: form.title.trim(),
    content: form.content,
    description: form.description,
    keywords: form.trigger_type === 'keyword' ? keywords : null,
    trigger_type: form.trigger_type,
    condition_logic: form.condition_logic,
    keyword_logic: form.keyword_logic,
    keyword_scope: form.keyword_scope.join(','),
    active_turns: clampActiveTurns(form.active_turns),
    token: clampToken(form.token, form.trigger_type),
    group_name: form.group_name.trim() || null,
  };

  const saved = isNew
    ? await createWorldEntry(worldId, data)
    : await updateWorldEntry(entry.id, data);
  if (form.trigger_type === 'state') {
    const entryId = isNew ? saved.id : entry.id;
    const validConditions = conditions.filter((condition) => (
      condition.target_field
      && condition.value
      && !/^(year|month|day|hour|minute):$/.test(condition.value)
    ));
    await replaceEntryConditions(entryId, validConditions);
  }
  await onSave();
}
